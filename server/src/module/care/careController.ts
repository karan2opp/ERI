import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { db } from '../../common/db';
import { trees, careLogs } from '../../common/db/schema';
import { eq, sql } from 'drizzle-orm';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { ACTION_NOUN, careOpensAt, isScheduledAction, waitText } from '../../common/utils/careWindow';
import { isAdminRole } from '../../common/auth/roles';
import { isUuid } from '../../common/utils/validation';

// A care log only restores health if the tree hasn't been cared for recently,
// so repeated logging can't pump the score.
const HEALTH_BONUS_COOLDOWN_MS = 60 * 60 * 1000;

export const addCareLog = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { treeId } = req.params;
    const { actionType, notes } = req.body;

    if (!isUuid(treeId)) {
      return res.status(404).json({ success: false, error: 'Tree not found' });
    }

    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) {
      return res.status(400).json({ success: false, error: 'notes must be a string of at most 2000 characters' });
    }

    const [tree] = await db.select().from(trees).where(eq(trees.id, treeId));

    if (!tree) {
      return res.status(404).json({
        success: false,
        error: 'Tree not found'
      });
    }

    if (tree.verificationStatus !== 'VERIFIED') {
      return res.status(409).json({ success: false, error: 'This tree is waiting for its photo to be checked. You can log care once it is approved.' });
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
    if (early) return res.status(409).json(early);

    let photoUrl: string | undefined;
    let photoPublicId: string | undefined;

    if (req.file) {
      const upload = await CloudinaryService.uploadImage(req.file, 'plantree/care_updates');
      photoUrl = upload.url;
      photoPublicId = upload.publicId;
    }

    const now = new Date();

    // Locked on the tree's row while it is checked again, so two quick taps can't both get through
    const result = await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(trees).where(eq(trees.id, treeId)).for('update');
      if (!fresh) return { notFound: true as const };
      const blocked = tooSoon(fresh);
      if (blocked) return { blocked };

      const [newLog] = await tx.insert(careLogs).values({
        treeId,
        actionType: validActionType,
        notes: notes?.trim() || null,
        photoUrl,
        photoPublicId,
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

    if ('notFound' in result) return res.status(404).json({ success: false, error: 'Tree not found' });
    if ('blocked' in result && result.blocked) {
      // Someone logged it a moment ago: the photo we just uploaded isn't needed
      if (photoPublicId) await CloudinaryService.deleteImage(photoPublicId);
      return res.status(409).json(result.blocked);
    }

    return res.status(201).json({
      success: true,
      message: `Care activity (${validActionType}) recorded successfully! 🌿`,
      data: (result as { newLog: unknown }).newLog
    });
  } catch (error) {
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
