import { eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { appSettings, trees, treeCategories } from '../db/schema';

// The kinds of tree the app started with. Admins add, rename and remove categories after that.
const DEFAULT_CATEGORIES = [
  'Neem (Azadirachta indica)',
  'Peepal (Ficus religiosa)',
  'Banyan (Ficus benghalensis)',
  'Mango (Mangifera indica)',
  'Jamun (Syzygium cumini)',
  'Ashoka (Saraca asoca)',
  'Gulmohar (Delonix regia)',
  'Jacaranda (Jacaranda mimosifolia)',
];

const SEEDED_KEY = 'categoriesSeeded';

/**
 * Runs when the server starts. Once ever (so an admin who deletes them isn't surprised by them coming
 * back), it creates the starting categories, and links existing trees to the category with the same name.
 */
export async function ensureDefaultCategories(): Promise<void> {
  try {
    const [done] = await db.select().from(appSettings).where(eq(appSettings.key, SEEDED_KEY));
    if (done) return;

    await db.insert(treeCategories).values(DEFAULT_CATEGORIES.map((name) => ({ name }))).onConflictDoNothing();
    // Trees planted before categories existed keep their kind; link them where the name matches
    await db
      .update(trees)
      .set({ categoryId: sql`(select ${treeCategories.id} from ${treeCategories} where lower(${treeCategories.name}) = lower(${trees.species}) limit 1)` })
      .where(isNull(trees.categoryId));
    await db.insert(appSettings).values({ key: SEEDED_KEY, value: 'true' }).onConflictDoNothing();
    console.log('🌳 Added the starting tree categories');
  } catch (err) {
    console.error('Could not add the starting tree categories:', err instanceof Error ? err.message : err);
  }
}
