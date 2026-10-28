import { Request, Response } from 'express';
import { z } from 'zod';
import { desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../../common/db';
import { mediaItems } from '../../common/db/schema';
import { isUuid } from '../../common/utils/validation';
import type { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { MAX_MEDIA_BATCH, claimUpload, discardUploads, inspectUpload, uploadRefSchema } from '../../common/services/uploads';
import { sendUploadError } from '../../common/utils/uploadErrors';

/**
 * The Media page: photos and videos of the team at work. Everyone can look; admins add and remove them. The files go
 * from the admin's browser straight to Cloudinary (see common/services/uploads.ts), so this server only keeps
 * their ids and works out the addresses.
 */

type MediaRow = typeof mediaItems.$inferSelect;

const present = (row: MediaRow) => ({
  id: row.id,
  type: row.type as 'IMAGE' | 'VIDEO',
  caption: row.caption ?? '',
  createdAt: row.createdAt,
  ...CloudinaryService.mediaUrls(row.publicId, row.version, row.type === 'VIDEO' ? 'video' : 'image'),
});

const listQuery = z.object({
  type: z.enum(['all', 'image', 'video']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** GET /media?type=all|image|video&page=&limit= (public): newest first, a page at a time. */
export const getMedia = async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid filters' });
  const { type, page, limit } = parsed.data;
  try {
    const where: SQL | undefined = type === 'all' ? undefined : eq(mediaItems.type, type === 'image' ? 'IMAGE' : 'VIDEO');
    const [rows, [{ total }], [counts]] = await Promise.all([
      db
        .select()
        .from(mediaItems)
        .where(where)
        .orderBy(desc(mediaItems.createdAt), desc(mediaItems.id))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: sql<number>`count(*)` }).from(mediaItems).where(where),
      // How many of each, for the filter chips
      db.select({ images: sql<number>`count(*) filter (where ${mediaItems.type} = 'IMAGE')`, videos: sql<number>`count(*) filter (where ${mediaItems.type} = 'VIDEO')` }).from(mediaItems),
    ]);
    const count = Number(total);
    // Checked again on every visit, so what an admin just added or removed shows up at once
    res.set('Cache-Control', 'no-cache');
    res.status(200).json({
      success: true,
      data: rows.map(present),
      total: count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(count / limit)),
      counts: { images: Number(counts.images), videos: Number(counts.videos) },
    });
  } catch (err) {
    console.error('Error loading media:', err);
    res.status(500).json({ success: false, error: 'Failed to load the media' });
  }
};

const addBody = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(['IMAGE', 'VIDEO']),
        file: uploadRefSchema,
        caption: z.string().trim().max(300, 'A caption can be up to 300 characters').optional(),
      })
    )
    .min(1)
    .max(MAX_MEDIA_BATCH),
});

/**
 * POST /media { items: [{ type, file, caption? }] } (admin): adds photos and videos that were already uploaded straight
 * to Cloudinary. All of them are added or none; anything refused is deleted from Cloudinary again.
 */
export const addMedia = async (req: Request, res: Response) => {
  const parsed = addBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Choose photos or videos to add' });
  const userId = (req as AuthenticatedRequest).userId!;
  const { items } = parsed.data;
  const ids = items.map((i) => i.file.publicId);
  if (new Set(ids).size !== ids.length) {
    await discardUploads([...new Set(ids)]);
    return res.status(400).json({ success: false, error: 'The same file was sent twice' });
  }

  try {
    // Each upload must be genuine and this admin's, and made for the right kind (a video in the videos folder)
    for (const i of items) await inspectUpload(userId, i.type === 'VIDEO' ? 'VIDEO' : 'MEDIA', i.file);

    const added = await db.transaction(async (tx) => {
      const rows: MediaRow[] = [];
      for (const i of items) {
        const kept = await claimUpload(tx, userId, i.type === 'VIDEO' ? 'VIDEO' : 'MEDIA', i.file);
        const [row] = await tx
          .insert(mediaItems)
          .values({ type: i.type, publicId: kept.publicId, version: i.file.version, caption: i.caption || null, uploadedBy: userId })
          .returning();
        rows.push(row);
      }
      return rows;
    });
    res.status(201).json({ success: true, data: added.map(present) });
  } catch (err) {
    // Nothing was saved: the uploaded files are not needed (anything missed is cleaned up daily)
    await discardUploads(ids);
    if (sendUploadError(res, err)) return;
    console.error('Error adding media:', err);
    res.status(500).json({ success: false, error: 'Failed to add them' });
  }
};

/** PATCH /media/:id { caption } (admin) */
export const updateMedia = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Not found' });
  const parsed = z.object({ caption: z.string().trim().max(300, 'A caption can be up to 300 characters') }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Check the caption' });
  try {
    const [row] = await db.update(mediaItems).set({ caption: parsed.data.caption || null }).where(eq(mediaItems.id, id)).returning();
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.status(200).json({ success: true, data: present(row) });
  } catch (err) {
    console.error('Error updating media:', err);
    res.status(500).json({ success: false, error: 'Failed to save the caption' });
  }
};

/** DELETE /media/:id (admin): removes it from the page and from Cloudinary. */
export const deleteMedia = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Not found' });
  try {
    const [row] = await db.delete(mediaItems).where(eq(mediaItems.id, id)).returning();
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    await CloudinaryService.deleteImage(row.publicId);
    res.status(200).json({ success: true, data: { id, removed: true } });
  } catch (err) {
    console.error('Error deleting media:', err);
    res.status(500).json({ success: false, error: 'Failed to remove it' });
  }
};
