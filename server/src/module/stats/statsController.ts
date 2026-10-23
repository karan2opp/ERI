import { Request, Response } from 'express';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import { db } from '../../common/db';
import { drives, trees } from '../../common/db/schema';
import { getSettings } from '../../common/services/settingsService';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /stats?today=YYYY-MM-DD: the four numbers on the public home page. Only totals leave the server,
 * never a drive's details, so counting team-only drives too doesn't reveal them. A drive counts as held
 * once its date has passed or an admin has marked it completed (the same rule as the Past list).
 */
export const getSiteStats = async (req: Request, res: Response) => {
  const today = typeof req.query.today === 'string' && DATE.test(req.query.today) ? req.query.today : new Date().toLocaleDateString('en-CA');
  try {
    const held = (type: 'PLANTATION' | 'CLEANUP') =>
      db
        .select({ n: sql<number>`count(*)` })
        .from(drives)
        .where(and(eq(drives.type, type), or(lt(drives.date, today), eq(drives.status, 'COMPLETED'))));

    const [[treeRow], [plantation], [cleanup], settings] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(trees).where(eq(trees.verificationStatus, 'VERIFIED')),
      held('PLANTATION'),
      held('CLEANUP'),
      getSettings(),
    ]);

    // A minute of caching is plenty for numbers that change a few times a week
    res.set('Cache-Control', 'public, max-age=60');
    res.status(200).json({
      success: true,
      data: {
        treesPlanted: Number(treeRow.n),
        plantationDrives: Number(plantation.n),
        cleanupDrives: Number(cleanup.n),
        wasteCollectedKg: settings.wasteCollectedKg,
      },
    });
  } catch (err) {
    console.error('Error loading site stats:', err);
    res.status(500).json({ success: false, error: 'Failed to load the numbers' });
  }
};
