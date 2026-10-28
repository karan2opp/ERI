import { randomUUID } from 'crypto';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { uploadTickets } from '../db/schema';
import { CloudinaryService, VIDEO_FOLDER, type SignedUpload } from './cloudinaryService';

/**
 * Direct photo uploads, in four steps:
 *  1. issueTickets: the server picks an id for each photo and signs a permission to upload it (a "ticket").
 *  2. The browser uploads the photo straight to Cloudinary and gets back { public_id, version, signature }.
 *  3. inspectUpload: the server checks that reply is genuine (and the ticket is this person's) and gives the photo's
 *     address, for example so the AI can look at it. discardUpload throws a rejected photo away at once.
 *  4. claimUpload: attaching the photo to a tree, care entry, drive or place uses the ticket up, in the same
 *     database transaction as the row that keeps the photo, so a photo can be attached only once.
 * Tickets nobody uses are cleaned up by uploadSweeper.ts, with the photos in them.
 */

// MEDIA is a photo for the Media page and VIDEO a video for it (both admin only)
export type UploadKind = 'TREE' | 'CARE' | 'DRIVE' | 'PLACE' | 'MEDIA' | 'VIDEO';
export const UPLOAD_KINDS = ['TREE', 'CARE', 'DRIVE', 'PLACE', 'MEDIA', 'VIDEO'] as const;

const FOLDER: Record<UploadKind, string> = {
  TREE: 'plantree/trees',
  CARE: 'plantree/care_updates',
  DRIVE: 'plantree/drives',
  PLACE: 'plantree/places',
  MEDIA: 'plantree/media',
  // The videos folder is what marks an upload as a video (see VIDEO_FOLDER in cloudinaryService.ts)
  VIDEO: VIDEO_FOLDER.replace(/\/$/, ''),
};

/** The most photos one place suggestion can carry. */
export const MAX_PLACE_PHOTOS = 5;
/** The most photos and videos an admin can add to the Media page in one go. */
export const MAX_MEDIA_BATCH = 10;
/** How many photo slots one person can hold at the same time (slots are used up as photos are attached). */
export const MAX_OPEN_TICKETS = 30;

/** What the browser sends back after uploading: the three fields of Cloudinary's reply that matter. */
export const uploadRefSchema = z.object({
  publicId: z.string().min(1).max(255),
  version: z.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{40,64}$/i),
});
export type UploadRef = z.infer<typeof uploadRefSchema>;

/** A photo problem with a status and message the app can show as it is. */
export class UploadError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/** The database or a transaction inside it. */
type Executor = Pick<typeof db, 'select' | 'delete'>;

export interface Ticket extends SignedUpload {
  publicId: string;
}

/** Hands out `count` signed upload permissions of one kind. */
export async function issueTickets(userId: string, kind: UploadKind, count: number): Promise<Ticket[]> {
  if (!CloudinaryService.isConfigured()) {
    throw new UploadError(503, 'UPLOADS_OFF', 'Photo uploads are not set up on this server yet.');
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(uploadTickets).where(eq(uploadTickets.userId, userId));
  if (Number(n) + count > MAX_OPEN_TICKETS) {
    throw new UploadError(429, 'TOO_MANY_UPLOADS', 'You have several photos waiting already. Use or remove them first, then try again.');
  }
  const ids = Array.from({ length: count }, () => `${FOLDER[kind]}/${userId}/${randomUUID()}`);
  await db.insert(uploadTickets).values(ids.map((publicId) => ({ publicId, userId, kind })));
  return ids.map((publicId) => ({ publicId, ...CloudinaryService.signUpload(publicId) }));
}

const notGenuine = () => new UploadError(400, 'BAD_UPLOAD', 'That photo could not be checked. Take it again.');
const alreadyUsed = () => new UploadError(409, 'UPLOAD_USED', 'That photo was already used or has expired. Take it again.');

/**
 * Looks at an upload without using it up: the reply must be genuine, and the ticket must be this person's, of this
 * kind, and not used yet. Returns the photo's address.
 */
export async function inspectUpload(userId: string, kind: UploadKind, ref: UploadRef): Promise<{ url: string; publicId: string }> {
  if (!CloudinaryService.isGenuineUpload(ref.publicId, ref.version, ref.signature)) throw notGenuine();
  const [ticket] = await db
    .select({ publicId: uploadTickets.publicId })
    .from(uploadTickets)
    .where(and(eq(uploadTickets.publicId, ref.publicId), eq(uploadTickets.userId, userId), eq(uploadTickets.kind, kind)));
  if (!ticket) throw alreadyUsed();
  return { url: CloudinaryService.urlFor(ref.publicId, ref.version), publicId: ref.publicId };
}

/**
 * Uses a ticket up. Call it inside the transaction that saves the row keeping the photo: if that transaction fails
 * the ticket comes back, and the photo can be cleaned up or tried again. Throws an UploadError when the reply isn't
 * genuine or the ticket isn't this person's, of this kind, and unused.
 */
export async function claimUpload(tx: Executor, userId: string, kind: UploadKind, ref: UploadRef): Promise<{ url: string; publicId: string }> {
  if (!CloudinaryService.isGenuineUpload(ref.publicId, ref.version, ref.signature)) throw notGenuine();
  const used = await tx
    .delete(uploadTickets)
    .where(and(eq(uploadTickets.publicId, ref.publicId), eq(uploadTickets.userId, userId), eq(uploadTickets.kind, kind)))
    .returning({ publicId: uploadTickets.publicId });
  if (used.length === 0) throw alreadyUsed();
  return { url: CloudinaryService.urlFor(ref.publicId, ref.version), publicId: ref.publicId };
}

/** Whether any tree, care entry, drive picture, place or Media page item is keeping this photo or video. */
export async function isPhotoInUse(publicId: string): Promise<boolean> {
  const rows = await db.execute(sql`
    select 1 as used from trees where photo_public_id = ${publicId}
    union all select 1 from care_logs where photo_public_id = ${publicId}
    union all select 1 from drive_photos where public_id = ${publicId}
    union all select 1 from media_items where public_id = ${publicId}
    union all select 1 from place_suggestions where photos @> ${JSON.stringify([{ publicId }])}::jsonb
    limit 1`);
  return rows.length > 0;
}

/**
 * Throws away photos that were uploaded but will not be used (a rejected photo, a retake, a save that failed): the
 * photo is deleted from Cloudinary and its ticket is removed. Photos that something is keeping are never touched.
 * When Cloudinary can't be reached the ticket stays, so the daily sweep tries again. Never throws.
 */
export async function discardUploads(publicIds: string[]): Promise<void> {
  for (const publicId of publicIds) {
    try {
      if (await isPhotoInUse(publicId)) {
        await db.delete(uploadTickets).where(eq(uploadTickets.publicId, publicId));
        continue;
      }
      if (await CloudinaryService.destroy(publicId)) await db.delete(uploadTickets).where(eq(uploadTickets.publicId, publicId));
    } catch (err) {
      console.error(`Could not discard the upload ${publicId}:`, err);
    }
  }
}

/** A person throws away a photo they uploaded but haven't used (for example when they retake it). Only their own. */
export async function discardOwnUpload(userId: string, publicId: string): Promise<boolean> {
  const [ticket] = await db
    .select({ publicId: uploadTickets.publicId })
    .from(uploadTickets)
    .where(and(eq(uploadTickets.publicId, publicId), eq(uploadTickets.userId, userId)));
  if (!ticket) return false;
  await discardUploads([publicId]);
  return true;
}
