import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { db } from '../../common/db';
import { trees, careLogs } from '../../common/db/schema';
import { eq, sql } from 'drizzle-orm';
import { CloudinaryService } from '../../common/services/cloudinaryService';
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

    let photoUrl: string | undefined;
    let photoPublicId: string | undefined;

    if (req.file) {
      const upload = await CloudinaryService.uploadImage(req.file, 'plantree/care_updates');
      photoUrl = upload.url;
      photoPublicId = upload.publicId;
    }

    const validActionType = typeof actionType === 'string' && ['WATERED', 'FERTILIZED', 'PRUNED', 'INSPECTED', 'WEEDED'].includes(actionType.toUpperCase())
      ? actionType.toUpperCase()
      : 'WATERED';

    const now = new Date();

    const [newLog] = await db.insert(careLogs).values({
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
      && (!tree.lastCaredAt || now.getTime() - tree.lastCaredAt.getTime() >= HEALTH_BONUS_COOLDOWN_MS);

    await db.update(trees)
      .set({
        // Only watering counts as watering; every kind of care counts as care
        ...(watered ? { lastWateredAt: now } : {}),
        ...(validActionType === 'FERTILIZED' ? { lastFertilizedAt: now } : {}),
        ...(validActionType === 'WEEDED' ? { lastWeededAt: now } : {}),
        lastCaredAt: now,
        healthScore: bonusEligible ? Math.min(100, (tree.healthScore || 80) + 10) : tree.healthScore,
        updatedAt: now
      })
      .where(eq(trees.id, treeId));

    return res.status(201).json({
      success: true,
      message: `Care activity (${validActionType}) recorded successfully! 🌿`,
      data: newLog
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
