import { Request, Response } from 'express';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../common/db';
import { drivePhotos, drives } from '../../common/db/schema';
import { isUuid } from '../../common/utils/validation';
import { isAdminRole } from '../../common/auth/roles';
import type { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { UploadError, claimUpload, discardOwnUpload, uploadRefSchema } from '../../common/services/uploads';
import { sendUploadError } from '../../common/utils/uploadErrors';
import { IMPACT_MAX, getSettings } from '../../common/services/settingsService';
import { accessProblem } from './driveController';

/**
 * Wrapping a drive up: an admin writes a summary, adds pictures (up to the limit set in Admin > Settings)
 * and marks the drive completed. From then on everyone who can see the drive sees its summary and pictures.
 */

/**
 * POST /drives/:id/complete { summary?, wasteKg? } (admin): marks the drive as done. It needs a summary (sent now or
 * saved earlier). For a clean-up drive the admin can say how many kilograms of waste were collected; that is
 * added to the total on the home page. Leaving it out keeps any amount saved earlier.
 */
export const completeDrive = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Drive not found' });
  const parsed = z
    .object({
      summary: z.string().trim().max(5000, 'The summary can be up to 5000 characters').optional(),
      wasteKg: z.number({ message: 'Waste collected must be a whole number of kilograms' }).int('Waste collected must be a whole number of kilograms').min(0, 'Waste collected cannot be negative').max(IMPACT_MAX, 'That is too much waste to be right').nullable().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Check the summary and the waste collected' });

  try {
    const [drive] = await db.select().from(drives).where(eq(drives.id, id));
    if (!drive) return res.status(404).json({ success: false, error: 'Drive not found' });
    if (drive.status === 'COMPLETED') return res.status(409).json({ success: false, error: 'This drive is already completed' });

    const summary = parsed.data.summary || drive.summary;
    if (!summary?.trim()) return res.status(400).json({ success: false, error: 'Write a summary of the drive before completing it' });
    const { wasteKg } = parsed.data;
    if (wasteKg != null && drive.type !== 'CLEANUP') return res.status(400).json({ success: false, error: 'Waste collected can only be recorded for a clean-up drive' });

    // Only moves a drive that is still scheduled, so two admins completing it at once can't both succeed
    const [done] = await db
      .update(drives)
      .set({ status: 'COMPLETED', summary, completedAt: new Date(), completedBy: (req as AuthenticatedRequest).userId, ...(wasteKg !== undefined ? { wasteKg } : {}) })
      .where(and(eq(drives.id, id), eq(drives.status, 'SCHEDULED')))
      .returning();
    if (!done) return res.status(409).json({ success: false, error: 'This drive is already completed' });
    res.status(200).json({ success: true, data: done });
  } catch (err) {
    console.error('Error completing drive:', err);
    res.status(500).json({ success: false, error: 'Failed to complete the drive' });
  }
};

/** POST /drives/:id/reopen (admin): undoes "completed". The summary and pictures are kept but hidden again. */
export const reopenDrive = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Drive not found' });
  try {
    const [drive] = await db
      .update(drives)
      .set({ status: 'SCHEDULED', completedAt: null, completedBy: null })
      .where(and(eq(drives.id, id), eq(drives.status, 'COMPLETED')))
      .returning();
    if (!drive) {
      const [exists] = await db.select({ id: drives.id }).from(drives).where(eq(drives.id, id));
      return res.status(exists ? 409 : 404).json({ success: false, error: exists ? 'This drive is not completed' : 'Drive not found' });
    }
    res.status(200).json({ success: true, data: drive });
  } catch (err) {
    console.error('Error reopening drive:', err);
    res.status(500).json({ success: false, error: 'Failed to reopen the drive' });
  }
};

const photosQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * GET /drives/:id/photos?page=&limit=: the drive's pictures, oldest first, a page at a time. Whoever can see
 * the drive can see them once it is completed; before that only admins (who are preparing it) get any.
 */
export const getDrivePhotos = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Drive not found' });
  const parsed = photosQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid page' });
  const { page, limit } = parsed.data;

  try {
    const [drive] = await db.select().from(drives).where(eq(drives.id, id));
    if (!drive) return res.status(404).json({ success: false, error: 'Drive not found' });
    const problem = accessProblem(drive, req);
    if (problem) return res.status(problem.status).json({ success: false, error: problem.error });

    const visible = drive.status === 'COMPLETED' || isAdminRole((req as AuthenticatedRequest).userRole);
    const [rows, [{ total }]] = visible
      ? await Promise.all([
          db
            .select({ id: drivePhotos.id, url: drivePhotos.url, createdAt: drivePhotos.createdAt })
            .from(drivePhotos)
            .where(eq(drivePhotos.driveId, id))
            .orderBy(asc(drivePhotos.createdAt), asc(drivePhotos.id))
            .limit(limit)
            .offset((page - 1) * limit),
          db.select({ total: sql<number>`count(*)` }).from(drivePhotos).where(eq(drivePhotos.driveId, id)),
        ])
      : [[], [{ total: 0 }]];

    res.status(200).json({ success: true, data: rows, total: Number(total), page, limit, totalPages: Math.max(1, Math.ceil(Number(total) / limit)) });
  } catch (err) {
    console.error('Error fetching drive photos:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch the pictures' });
  }
};

/**
 * POST /drives/:id/photos { photo } (admin): adds a picture that was already uploaded straight to Cloudinary, up to
 * the limit set in Admin > Settings.
 */
export const addDrivePhoto = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Drive not found' });
  const parsed = z.object({ photo: uploadRefSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Choose a picture to add' });
  const userId = (req as AuthenticatedRequest).userId!;
  const photoRef = parsed.data.photo;

  try {
    const [drive] = await db.select({ id: drives.id }).from(drives).where(eq(drives.id, id));
    if (!drive) {
      await discardOwnUpload(userId, photoRef.publicId);
      return res.status(404).json({ success: false, error: 'Drive not found' });
    }

    const { drivePhotoLimit: limit } = await getSettings();
    const full = `A drive can have up to ${limit} ${limit === 1 ? 'picture' : 'pictures'}. Remove one to add another.`;
    const [{ n: have }] = await db.select({ n: sql<number>`count(*)` }).from(drivePhotos).where(eq(drivePhotos.driveId, id));
    if (Number(have) >= limit) {
      await discardOwnUpload(userId, photoRef.publicId);
      return res.status(409).json({ success: false, error: full, limit });
    }

    // Counted again together with the insert, locking the drive, so a few uploads at once can't pass the limit
    const photo = await db.transaction(async (tx) => {
      await tx.select({ id: drives.id }).from(drives).where(eq(drives.id, id)).for('update');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)` }).from(drivePhotos).where(eq(drivePhotos.driveId, id));
      if (Number(n) >= limit) return null;
      const kept = await claimUpload(tx, userId, 'DRIVE', photoRef);
      const [row] = await tx
        .insert(drivePhotos)
        .values({ driveId: id, url: kept.url, publicId: kept.publicId, uploadedBy: userId })
        .returning({ id: drivePhotos.id, url: drivePhotos.url, createdAt: drivePhotos.createdAt });
      return row;
    });
    if (!photo) {
      await discardOwnUpload(userId, photoRef.publicId);
      return res.status(409).json({ success: false, error: full, limit });
    }
    res.status(201).json({ success: true, data: photo });
  } catch (err) {
    await discardOwnUpload(userId, photoRef.publicId);
    if (sendUploadError(res, err)) return;
    console.error('Error adding drive photo:', err);
    res.status(500).json({ success: false, error: 'Failed to add the picture' });
  }
};

/** DELETE /drives/:id/photos/:photoId (admin) */
export const deleteDrivePhoto = async (req: Request, res: Response) => {
  const { id, photoId } = req.params;
  if (!isUuid(id) || !isUuid(photoId)) return res.status(404).json({ success: false, error: 'Picture not found' });
  try {
    const [photo] = await db.delete(drivePhotos).where(and(eq(drivePhotos.id, photoId), eq(drivePhotos.driveId, id))).returning();
    if (!photo) return res.status(404).json({ success: false, error: 'Picture not found' });
    await CloudinaryService.deleteImage(photo.publicId ?? undefined);
    res.status(200).json({ success: true, data: { id: photoId, removed: true } });
  } catch (err) {
    console.error('Error deleting drive photo:', err);
    res.status(500).json({ success: false, error: 'Failed to remove the picture' });
  }
};

/** PUT /drives/:id/photos/:photoId { photo } (admin): swaps a picture for one already uploaded, keeping its place. */
export const replaceDrivePhoto = async (req: Request, res: Response) => {
  const { id, photoId } = req.params;
  if (!isUuid(id) || !isUuid(photoId)) return res.status(404).json({ success: false, error: 'Picture not found' });
  const parsed = z.object({ photo: uploadRefSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Choose a picture to replace it with' });
  const userId = (req as AuthenticatedRequest).userId!;
  const photoRef = parsed.data.photo;
  try {
    const [old] = await db.select().from(drivePhotos).where(and(eq(drivePhotos.id, photoId), eq(drivePhotos.driveId, id)));
    if (!old) {
      await discardOwnUpload(userId, photoRef.publicId);
      return res.status(404).json({ success: false, error: 'Picture not found' });
    }

    const photo = await db.transaction(async (tx) => {
      const kept = await claimUpload(tx, userId, 'DRIVE', photoRef);
      const [row] = await tx
        .update(drivePhotos)
        .set({ url: kept.url, publicId: kept.publicId, uploadedBy: userId })
        .where(and(eq(drivePhotos.id, photoId), eq(drivePhotos.driveId, id)))
        .returning({ id: drivePhotos.id, url: drivePhotos.url, createdAt: drivePhotos.createdAt });
      // Removed by someone else in the meantime: undo (the upload is thrown away below)
      if (!row) throw new UploadError(404, 'NOT_FOUND', 'Picture not found');
      return row;
    });
    await CloudinaryService.deleteImage(old.publicId ?? undefined);
    res.status(200).json({ success: true, data: photo });
  } catch (err) {
    await discardOwnUpload(userId, photoRef.publicId);
    if (sendUploadError(res, err)) return;
    console.error('Error replacing drive photo:', err);
    res.status(500).json({ success: false, error: 'Failed to replace the picture' });
  }
};
