import { and, asc, eq, lt } from 'drizzle-orm';
import { db } from '../db';
import { appSettings, uploadTickets } from '../db/schema';
import { CloudinaryService } from './cloudinaryService';
import { isPhotoInUse } from './uploads';

/**
 * The daily clean-up of photos that were uploaded but never used: someone closed the app after uploading, lost
 * signal, or uploaded and walked away. A ticket older than a day that nobody used up is removed, and so is the photo
 * in it. Before anything is deleted it is checked once more against the database, so a photo that a tree, care
 * entry, drive or place is keeping can never be deleted by mistake.
 */

const GRACE_MS = 24 * 60 * 60 * 1000;
const BATCH = 50;
const MAX_BATCHES = 20;
const RESULT_KEY = 'lastUploadSweep';

export interface SweepResult {
  deleted: number;
  kept: number;
  failed: number;
}

export async function sweepUnusedUploads(): Promise<SweepResult> {
  const result: SweepResult = { deleted: 0, kept: 0, failed: 0 };
  if (!CloudinaryService.isConfigured()) return result;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    // Locked as they are taken, so two copies of the server can't clean the same ones at once
    const handled = await db.transaction(async (tx) => {
      const old = await tx
        .select({ publicId: uploadTickets.publicId })
        .from(uploadTickets)
        .where(lt(uploadTickets.createdAt, new Date(Date.now() - GRACE_MS)))
        .orderBy(asc(uploadTickets.createdAt))
        .limit(BATCH)
        .for('update', { skipLocked: true });

      let failedHere = 0;
      for (const { publicId } of old) {
        if (await isPhotoInUse(publicId)) {
          result.kept++;
        } else if (await CloudinaryService.destroy(publicId)) {
          result.deleted++;
        } else {
          // Cloudinary couldn't be reached: leave the ticket for the next run
          failedHere++;
          result.failed++;
          continue;
        }
        await tx.delete(uploadTickets).where(and(eq(uploadTickets.publicId, publicId)));
      }
      return { count: old.length, failedHere };
    });
    // Nothing left, or Cloudinary is having trouble: stop for today
    if (handled.count < BATCH || handled.failedHere > 0) break;
  }

  await db
    .insert(appSettings)
    .values({ key: RESULT_KEY, value: JSON.stringify({ at: new Date().toISOString(), ...result }) })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify({ at: new Date().toISOString(), ...result }), updatedAt: new Date() } });
  return result;
}

const SIX_HOURS = 6 * 60 * 60 * 1000;

/**
 * Starts the clean-up: once shortly after the server starts (a free server that sleeps may only be awake for a
 * while), then every six hours. Safe to run often: it only touches tickets older than a day.
 */
export function startUploadSweeper(): void {
  if (!CloudinaryService.isConfigured()) return;
  const run = () =>
    sweepUnusedUploads().then(
      (r) => r.deleted + r.kept + r.failed > 0 && console.log(`🧹 Photo clean-up: ${r.deleted} deleted, ${r.kept} kept, ${r.failed} to retry`),
      (err) => console.error('Photo clean-up failed:', err instanceof Error ? err.message : err)
    );
  setTimeout(run, 2 * 60 * 1000).unref();
  setInterval(run, SIX_HOURS).unref();
}
