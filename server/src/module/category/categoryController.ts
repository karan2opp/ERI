import { Request, Response } from 'express';
import { and, asc, count, eq, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../common/db';
import { trees, treeCategories } from '../../common/db/schema';
import { isUuid } from '../../common/utils/validation';
import type { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';

// Escape LIKE wildcards so a search for "%" or "_" matches literally
const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, '\\$&')}%`;

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
});

/**
 * GET /categories (public): the tree categories, 10 per page by default, A to Z, with how many verified
 * trees are in each. `search` matches the name.
 */
export const listCategories = async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid filters' });
  const { page, limit, search } = parsed.data;
  const where = search ? ilike(treeCategories.name, likePattern(search)) : undefined;

  try {
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: treeCategories.id,
          name: treeCategories.name,
          description: treeCategories.description,
          // Written out with table names: in a single-table query drizzle leaves them off, and "id" would then
          // mean the inner table's id
          treeCount: sql<number>`(select count(*) from trees t where t.category_id = "tree_categories"."id" and t.verification_status = 'VERIFIED')`,
        })
        .from(treeCategories)
        .where(where)
        .orderBy(asc(sql`lower(${treeCategories.name})`))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() }).from(treeCategories).where(where),
    ]);
    res.status(200).json({
      success: true,
      data: rows.map((r) => ({ ...r, treeCount: Number(r.treeCount) })),
      total: Number(total),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
    });
  } catch (err) {
    console.error('Error listing categories:', err);
    res.status(500).json({ success: false, error: 'Failed to load the categories' });
  }
};

/** GET /categories/:id (public): one category. */
export const getCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Category not found' });
  try {
    const [row] = await db.select().from(treeCategories).where(eq(treeCategories.id, id));
    if (!row) return res.status(404).json({ success: false, error: 'Category not found' });
    res.status(200).json({ success: true, data: { id: row.id, name: row.name, description: row.description } });
  } catch (err) {
    console.error('Error loading category:', err);
    res.status(500).json({ success: false, error: 'Failed to load the category' });
  }
};

const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);
const descriptionSchema = z.string().trim().max(500);

const createSchema = z.object({ name: nameSchema, description: descriptionSchema.optional() });
const updateSchema = z
  .object({ name: nameSchema.optional(), description: descriptionSchema.optional() })
  .refine((v) => v.name !== undefined || v.description !== undefined, 'Send a name or a description');

const taken = async (name: string, exceptId?: string) => {
  const rows = await db.select({ id: treeCategories.id }).from(treeCategories).where(sql`lower(${treeCategories.name}) = lower(${name})`);
  return rows.some((r) => r.id !== exceptId);
};

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === '23505' || (err as { cause?: { code?: string } })?.cause?.code === '23505';

/** POST /categories (admin): { name, description? } */
export const createCategory = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
  try {
    if (await taken(parsed.data.name)) return res.status(409).json({ success: false, error: 'A category with that name already exists' });
    const [row] = await db
      .insert(treeCategories)
      .values({ name: parsed.data.name, description: parsed.data.description || null, createdBy: req.userId })
      .returning();
    res.status(201).json({ success: true, data: { id: row.id, name: row.name, description: row.description, treeCount: 0 } });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ success: false, error: 'A category with that name already exists' });
    console.error('Error creating category:', err);
    res.status(500).json({ success: false, error: 'Failed to create the category' });
  }
};

/** PATCH /categories/:id (admin): rename it or change its description. A new name carries over to the trees in it. */
export const updateCategory = async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Category not found' });
  try {
    const [existing] = await db.select().from(treeCategories).where(eq(treeCategories.id, id));
    if (!existing) return res.status(404).json({ success: false, error: 'Category not found' });
    if (parsed.data.name !== undefined && (await taken(parsed.data.name, id))) {
      return res.status(409).json({ success: false, error: 'A category with that name already exists' });
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(treeCategories)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(treeCategories.id, id))
        .returning();
      // Trees show their kind by name, so a rename has to reach them
      if (parsed.data.name !== undefined && parsed.data.name !== existing.name) {
        await tx.update(trees).set({ species: parsed.data.name }).where(eq(trees.categoryId, id));
      }
      return row;
    });
    res.status(200).json({ success: true, data: { id: updated.id, name: updated.name, description: updated.description } });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ success: false, error: 'A category with that name already exists' });
    console.error('Error updating category:', err);
    res.status(500).json({ success: false, error: 'Failed to update the category' });
  }
};

/**
 * DELETE /categories/:id (admin). The trees in it stay on the map with the kind name they had, but are no
 * longer listed under a category. Returns how many trees that was.
 */
export const deleteCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Category not found' });
  try {
    const [{ inUse }] = await db.select({ inUse: count() }).from(trees).where(eq(trees.categoryId, id));
    const removed = await db.delete(treeCategories).where(eq(treeCategories.id, id)).returning({ id: treeCategories.id });
    if (removed.length === 0) return res.status(404).json({ success: false, error: 'Category not found' });
    res.status(200).json({ success: true, data: { id, removed: true, treesKept: Number(inUse) } });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ success: false, error: 'Failed to delete the category' });
  }
};

// Used when planting and editing: the category a tree is being put in
export async function findCategory(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(treeCategories).where(and(eq(treeCategories.id, id)));
  return row ?? null;
}
