import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { db } from '../../common/db';
import { trees, careLogs } from '../../common/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { claimUpload, discardOwnUpload, uploadRefSchema, type UploadRef } from '../../common/services/uploads';
import { sendUploadError } from '../../common/utils/uploadErrors';
import { ACTION_NOUN, careOpensAt, isScheduledAction, waitText } from '../../common/utils/careWindow';
import { isAdminRole } from '../../common/auth/roles';
import { isUuid } from '../../common/utils/validation';

// A care log only restores health if the tree hasn't been cared for recently,
// so repeated logging can't pump the score.
const HEALTH_BONUS_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * POST /trees/:treeId/care { actionType?, notes?, photo? }: logs care. The photo is optional and already on
 * Cloudinary (uploaded straight from the phone); it is attached in the same transaction as the entry.
 */
export const addCareLog = async (req: AuthenticatedRequest, res: Response) => {
  // Set once the photo's reply has been read, so a failure can throw the unused upload away
  let photoRef: UploadRef | undefined;
  const userId = req.userId!;
  try {
    const { treeId } = req.params;
    const { actionType, notes } = req.body ?? {};
    const photoParsed = uploadRefSchema.optional().safeParse(req.body?.photo);
    if (!photoParsed.success) return res.status(400).json({ success: false, error: 'The photo could not be read. Take it again.' });
    photoRef = photoParsed.data;

    // Anything refused below leaves the upload unused: it is thrown away (and the daily clean-up catches any miss)
    const refuse = async (status: number, body: object) => {
      if (photoRef) await discardOwnUpload(userId, photoRef.publicId);
      return res.status(status).json(body);
    };

    if (!isUuid(treeId)) {
      return refuse(404, { success: false, error: 'Tree not found' });
    }

    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) {
      return refuse(400, { success: false, error: 'notes must be a string of at most 2000 characters' });
    }

    const [tree] = await db.select().from(trees).where(eq(trees.id, treeId));

    if (!tree) {
      return refuse(404, { success: false, error: 'Tree not found' });
    }

    if (tree.verificationStatus !== 'VERIFIED') {
      return refuse(409, { success: false, error: 'This tree is waiting for its photo to be checked. You can log care once it is approved.' });
    }

    const validActionType = typeof actionType === 'string' && ['WATERED', 'FERTILIZED', 'PRUNED', 'INSPECTED', 'WEEDED'].includes(actionType.toUpperCase())
      ? actionType.toUpperCase()
      : 'WATERED';

    // Watering, feeding and removing grass open a day before they are due. Admins can log them any time.
    const mustWait = !isAdminRole(req.userRole);
    const tooSoon = (row: typeof tree) => {
      const opensAt = mustWait ? careOpensAt(row, validActionType) : null;
      if (!opensAt || opensAt.getTime() <= Date.now()) return null;
      const dueInDays = isScheduledAction(validActionType)
        ? validActionType === 'WATERED' ? row.waterEveryDays : validActionType === 'FERTILIZED' ? row.fertilizeEveryDays : row.weedEveryDays
        : 0;
      return {
        success: false,
        code: 'TOO_SOON',
        availableAt: opensAt.toISOString(),
        error: `${ACTION_NOUN[validActionType as 'WATERED']} for ${row.name} opens in ${waitText(opensAt.getTime() - Date.now())}: it can be done from a day before it is due (every ${dueInDays} ${dueInDays === 1 ? 'day' : 'days'}).`
      };
    };
    const early = tooSoon(tree);
    if (early) return refuse(409, early);

    const now = new Date();

    // Locked on the tree's row while it is checked again, so two quick taps can't both get through
    const result = await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(trees).where(eq(trees.id, treeId)).for('update');
      if (!fresh) return { notFound: true as const };
      const blocked = tooSoon(fresh);
      if (blocked) return { blocked };

      const kept = photoRef ? await claimUpload(tx, userId, 'CARE', photoRef) : null;
      const [newLog] = await tx.insert(careLogs).values({
        treeId,
        actionType: validActionType,
        notes: notes?.trim() || null,
        photoUrl: kept?.url,
        photoPublicId: kept?.publicId,
        userId,
        performedAt: now
      }).returning();

      const watered = validActionType === 'WATERED';
      // Watering and feeding restore health, at most once per cooldown
      const bonusEligible = (watered || validActionType === 'FERTILIZED')
        && (!fresh.lastCaredAt || now.getTime() - fresh.lastCaredAt.getTime() >= HEALTH_BONUS_COOLDOWN_MS);

      await tx.update(trees)
        .set({
          // Only watering counts as watering; every kind of care counts as care
          ...(watered ? { lastWateredAt: now } : {}),
          ...(validActionType === 'FERTILIZED' ? { lastFertilizedAt: now } : {}),
          ...(validActionType === 'WEEDED' ? { lastWeededAt: now } : {}),
          lastCaredAt: now,
          healthScore: bonusEligible ? Math.min(100, (fresh.healthScore || 80) + 10) : fresh.healthScore,
          updatedAt: now
        })
        .where(eq(trees.id, treeId));
      return { newLog };
    });

    if ('notFound' in result) {
      if (photoRef) await discardOwnUpload(userId, photoRef.publicId);
      return res.status(404).json({ success: false, error: 'Tree not found' });
    }
    if ('blocked' in result && result.blocked) {
      // Someone logged it a moment ago: the photo that was uploaded isn't needed
      if (photoRef) await discardOwnUpload(userId, photoRef.publicId);
      return res.status(409).json(result.blocked);
    }

    return res.status(201).json({
      success: true,
      message: `Care activity (${validActionType}) recorded successfully! 🌿`,
      data: (result as { newLog: unknown }).newLog
    });
  } catch (error) {
    // The entry was not saved, so an uploaded photo is not needed (only the person's own unused upload is touched)
    if (photoRef) await discardOwnUpload(userId, photoRef.publicId);
    if (sendUploadError(res, error)) return;
    console.error('Error logging care activity:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to log care activity'
    });
  }
};

/**
 * GET /trees/:treeId/care?page=1&limit=10: one page of a tree's care history, newest first,
 * with the total so the app can offer "show older entries".
 */
export const getTreeCareHistory = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;

    if (!isUuid(treeId)) {
      return res.status(404).json({ success: false, error: 'Tree not found' });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));

    const [history, [{ count }]] = await Promise.all([
      db.query.careLogs.findMany({
        where: eq(careLogs.treeId, treeId),
        orderBy: (logs, { desc }) => [desc(logs.performedAt)],
        limit,
        offset: (page - 1) * limit,
        with: {
          performer: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true
            }
          }
        }
      }),
      db.select({ count: sql<number>`count(*)` }).from(careLogs).where(eq(careLogs.treeId, treeId)),
    ]);

    const total = Number(count);
    return res.status(200).json({
      success: true,
      data: history,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error('Error fetching care history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch care history'
    });
  }
};

/**
 * Who may change the photo of a care entry: the person who planted the tree, or an admin. Answers the
 * request itself (404 or 403) and returns null when they may not.
 */
const loadCareLogForPhotoChange = async (req: AuthenticatedRequest, res: Response) => {
  const { treeId, logId } = req.params;
  if (!isUuid(treeId) || !isUuid(logId)) {
    res.status(404).json({ success: false, error: 'Care entry not found' });
    return null;
  }
  const [tree] = await db.select().from(trees).where(eq(trees.id, treeId));
  if (!tree) {
    res.status(404).json({ success: false, error: 'Tree not found' });
    return null;
  }
  if (tree.userId !== req.userId && !isAdminRole(req.userRole)) {
    res.status(403).json({ success: false, error: 'Forbidden: only the person who planted this tree or an admin can change its photos' });
    return null;
  }
  const [log] = await db.select().from(careLogs).where(and(eq(careLogs.id, logId), eq(careLogs.treeId, treeId)));
  if (!log) {
    res.status(404).json({ success: false, error: 'Care entry not found' });
    return null;
  }
  return { tree, log };
};

/**
 * The entry that records the planting shares the tree's own photo, so that picture is only let go of
 * (from Cloudinary) when it isn't the tree's.
 */
const releasePhoto = (tree: { photoPublicId: string | null }, publicId: string | null) =>
  publicId && publicId !== tree.photoPublicId ? CloudinaryService.deleteImage(publicId) : Promise.resolve();

/** PUT /trees/:treeId/care/:logId/photo { photo }: replaces the photo of a care entry with one already uploaded to Cloudinary. */
export const replaceCarePhoto = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ photo: uploadRefSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Take a photo to replace it with' });
  const userId = req.userId!;
  const photoRef = parsed.data.photo;
  try {
    const found = await loadCareLogForPhotoChange(req, res);
    if (!found) {
      // Refused (not found, or not allowed): the new upload isn't needed
      await discardOwnUpload(userId, photoRef.publicId);
      return;
    }
    const [log] = await db.transaction(async (tx) => {
      const kept = await claimUpload(tx, userId, 'CARE', photoRef);
      return tx.update(careLogs).set({ photoUrl: kept.url, photoPublicId: kept.publicId }).where(eq(careLogs.id, found.log.id)).returning();
    });
    await releasePhoto(found.tree, found.log.photoPublicId);
    return res.status(200).json({ success: true, data: log });
  } catch (error) {
    await discardOwnUpload(userId, photoRef.publicId);
    if (sendUploadError(res, error)) return;
    console.error('Error replacing care photo:', error);
    return res.status(500).json({ success: false, error: 'Failed to replace the photo' });
  }
};

/** DELETE /trees/:treeId/care/:logId/photo: removes the photo from a care entry (the entry itself stays). */
export const removeCarePhoto = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const found = await loadCareLogForPhotoChange(req, res);
    if (!found) return;
    if (!found.log.photoUrl) return res.status(404).json({ success: false, error: 'This entry has no photo' });
    const [log] = await db.update(careLogs).set({ photoUrl: null, photoPublicId: null }).where(eq(careLogs.id, found.log.id)).returning();
    await releasePhoto(found.tree, found.log.photoPublicId);
    return res.status(200).json({ success: true, data: log });
  } catch (error) {
    console.error('Error removing care photo:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove the photo' });
  }
};
