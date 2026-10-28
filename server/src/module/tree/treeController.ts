import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { db } from '../../common/db';
import { trees, careLogs, users } from '../../common/db/schema';
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { getAuth } from '@clerk/express';
import { TREE_STATUSES, needsCare, needsWater, statusCondition } from '../../common/utils/careSchedule';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { z } from 'zod';
import { isUuid, latitudeSchema, longitudeSchema } from '../../common/utils/validation';
import { verifyTreePhotoOnce, type TreeCheck } from '../../common/services/treeVerifier';
import { claimUpload, discardUploads, inspectUpload, uploadRefSchema } from '../../common/services/uploads';
import { sendUploadError } from '../../common/utils/uploadErrors';
import { checkPlantingLocation } from '../../common/utils/treePolicy';
import { findCategory } from '../category/categoryController';
import { photoNeedsCheck } from '../../common/services/settingsService';
import { isAdminRole } from '../../common/auth/roles';
import { notifyAdmins } from '../../common/services/inbox';

/** The AI photo check, unless settings say this person's photos aren't checked (then it counts as a pass). */
const checkPhoto = async (photo: { url: string; publicId: string }, role: string | undefined, userId: string): Promise<TreeCheck> =>
  (await photoNeedsCheck(role)) ? verifyTreePhotoOnce(photo.url, photo.publicId, userId) : { verdict: 'TRUE' };

/**
 * POST /trees/check-photo { photo: { publicId, version, signature } }: the answer for a photo that has just been
 * uploaded to Cloudinary, so the person knows before filling in the form. TRUE / FALSE / PENDING, or SKIPPED when
 * this person's photos aren't checked. A rejected (FALSE) photo is deleted from Cloudinary right here.
 * Planting still checks again on the server (reusing this answer), so this only informs: it can't be skipped.
 */
export const checkTreePhoto = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ photo: uploadRefSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Send the photo you uploaded' });
  try {
    const photo = await inspectUpload(req.userId!, 'TREE', parsed.data.photo);
    if (!(await photoNeedsCheck(req.userRole))) return res.status(200).json({ success: true, verdict: 'SKIPPED' });
    const check = await verifyTreePhotoOnce(photo.url, photo.publicId, req.userId!);
    if (check.verdict === 'FALSE') await discardUploads([photo.publicId]);
    res.status(200).json({ success: true, verdict: check.verdict });
  } catch (err) {
    if (sendUploadError(res, err)) return;
    console.error('Error checking a tree photo:', err);
    res.status(500).json({ success: false, error: 'Could not check the photo' });
  }
};

/** Trees everyone can see: verified ones. A viewer also sees their own, even while one waits for review. */
const visibleTrees = (viewerId?: string | null): SQL =>
  viewerId ? or(eq(trees.verificationStatus, 'VERIFIED'), eq(trees.userId, viewerId))! : eq(trees.verificationStatus, 'VERIFIED');

// When a tree was planted: not in the future (a few minutes' clock skew allowed), not absurdly old
const plantedAtSchema = z.coerce
  .date()
  .refine((d) => d.getTime() <= Date.now() + 5 * 60 * 1000, 'Planting date cannot be in the future')
  .refine((d) => d.getFullYear() >= 1900, 'Planting date is too far in the past');

// How many days between each care task: at least daily, at most yearly
const intervalDays = z.coerce
  .number({ invalid_type_error: 'Must be a number of days' })
  .int('Must be a whole number of days')
  .min(1, 'Must be at least 1 day')
  .max(365, 'Must be at most 365 days');

// Within this long of planting, adding the tree counts as its first watering
const JUST_PLANTED_MS = 24 * 60 * 60 * 1000;

const createTreeSchema = z.object({
  name: z.string().trim().min(1).max(255),
  // The kind of tree is a category an admin created
  categoryId: z.string().uuid('Choose a kind of tree'),
  description: z.string().trim().max(5000).optional(),
  address: z.string().trim().max(500).optional(),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  plantedAt: plantedAtSchema.optional(),
  // How often it needs each kind of care (defaults: water 7, fertilise 60, remove grass 30 days)
  waterEveryDays: intervalDays.optional(),
  fertilizeEveryDays: intervalDays.optional(),
  weedEveryDays: intervalDays.optional(),
  // Where the person's phone says they are standing: the tree must be within 15 m of it
  deviceLatitude: latitudeSchema,
  deviceLongitude: longitudeSchema,
  deviceAccuracy: z.coerce.number().positive().max(100_000),
  // The photo, already uploaded straight to Cloudinary (see common/services/uploads.ts)
  photo: uploadRefSchema.optional(),
});

const updateTreeSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  categoryId: z.string().uuid('Choose a kind of tree').optional(),
  description: z.string().trim().max(5000).optional(),
  address: z.string().trim().max(500).optional(),
  healthScore: z.coerce.number().int().min(0).max(100).optional(),
  plantedAt: plantedAtSchema.optional(),
  waterEveryDays: intervalDays.optional(),
  fertilizeEveryDays: intervalDays.optional(),
  weedEveryDays: intervalDays.optional(),
  // A new photo, already uploaded straight to Cloudinary
  photo: uploadRefSchema.optional(),
});

const validationError = (error: z.ZodError) =>
  error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');

export const getTreeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(404).json({ success: false, error: 'Tree not found' });
    }

    const tree = await db.query.trees.findFirst({
      where: eq(trees.id, id),
      with: {
        owner: {
          columns: {
            id: true,
            name: true,
            avatarUrl: true
          }
        },
        // Just the latest entry (for "last cared for"); the full history is paged at GET /trees/:id/care
        careLogs: {
          orderBy: (logs, { desc }) => [desc(logs.performedAt)],
          limit: 1,
          with: {
            performer: {
              columns: {
                id: true,
                name: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    // A tree waiting for review is seen only by its owner and admins
    const viewer = req as AuthenticatedRequest;
    const mayView = tree && (tree.verificationStatus === 'VERIFIED' || tree.userId === viewer.userId || isAdminRole(viewer.userRole));
    if (!tree || !mayView) {
      return res.status(404).json({
        success: false,
        error: 'Tree not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: tree
    });
  } catch (error) {
    console.error('Error fetching tree by ID:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch tree details'
    });
  }
};

export const createTree = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const parsed = createTreeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: validationError(parsed.error)
      });
    }

    const { name, description, latitude, longitude, address } = parsed.data;

    const category = await findCategory(parsed.data.categoryId);
    if (!category) return res.status(400).json({ success: false, error: 'That kind of tree is not available any more. Choose another.' });
    const species = category.name;

    // 1. The person has to be standing at the tree (cheap, so it goes before the photo check)
    const tooFar = checkPlantingLocation(
      { latitude, longitude },
      { latitude: parsed.data.deviceLatitude, longitude: parsed.data.deviceLongitude, accuracy: parsed.data.deviceAccuracy }
    );
    if (tooFar) {
      return res.status(422).json({ success: false, code: 'TOO_FAR', error: tooFar });
    }

    // 2. A photo is required, and it has to show a tree or plant. It is already on Cloudinary: the check looks at it there.
    const photoRef = parsed.data.photo;
    if (!photoRef) {
      return res.status(400).json({ success: false, code: 'PHOTO_REQUIRED', error: 'Take a photo of the tree to register it' });
    }
    const photo = await inspectUpload(userId, 'TREE', photoRef);
    const check = await checkPhoto(photo, req.userRole, userId);
    if (check.verdict === 'FALSE') {
      // Nothing is saved, and the rejected photo is deleted from Cloudinary at once
      await discardUploads([photo.publicId]);
      return res.status(422).json({
        success: false,
        code: 'NOT_A_TREE',
        error: "That photo doesn't look like a tree or plant. Take a clear photo of the tree you planted."
      });
    }

    const now = new Date();
    const plantedAt = parsed.data.plantedAt ?? now;
    // Planted just now: that planting is its first watering. An older tree being added to the map
    // has no known watering yet, so it starts as "needs water" until someone logs one.
    const justPlanted = now.getTime() - plantedAt.getTime() < JUST_PLANTED_MS;

    let newTree;
    try {
      // The photo is claimed in the same transaction as the tree: both are saved, or neither
      newTree = await db.transaction(async (tx) => {
        const kept = await claimUpload(tx, userId, 'TREE', photoRef);
        const [row] = await tx.insert(trees).values({
          name,
          species,
          categoryId: category.id,
          description: description || '',
          photoUrl: kept.url,
          photoPublicId: kept.publicId,
          latitude,
          longitude,
          address: address || '',
          userId,
          plantedAt,
          waterEveryDays: parsed.data.waterEveryDays,
          fertilizeEveryDays: parsed.data.fertilizeEveryDays,
          weedEveryDays: parsed.data.weedEveryDays,
          lastWateredAt: justPlanted ? plantedAt : null,
          lastCaredAt: justPlanted ? plantedAt : now,
          healthScore: 100,
          // TRUE goes straight on the map; PENDING waits for an admin to look at the photo
          verificationStatus: check.verdict === 'TRUE' ? 'VERIFIED' : 'PENDING',
          verificationNote: check.verdict === 'TRUE' ? null : check.note ?? null
        }).returning();

        await tx.insert(careLogs).values({
          treeId: row.id,
          actionType: justPlanted ? 'WATERED' : 'INSPECTED',
          notes: justPlanted ? 'Planted and watered' : 'Added to the map',
          photoUrl: row.photoUrl,
          photoPublicId: row.photoPublicId,
          userId,
          performedAt: justPlanted ? plantedAt : now
        });
        return row;
      });
    } catch (err) {
      // The tree was not saved, so the photo is not needed (it is only deleted if nothing is keeping it)
      await discardUploads([photo.publicId]);
      throw err;
    }

    // Tell the admins (in the background): a verified tree opens on the map, one waiting for review opens Review
    const pending = newTree.verificationStatus === 'PENDING';
    void notifyAdmins(
      {
        type: 'TREE_PLANTED',
        title: `${req.userName || 'Someone'} planted a new tree`,
        body: [newTree.name, newTree.species].filter(Boolean).join(' · ') + (pending ? ' · waiting for review' : ''),
        link: pending ? '/map?open=admin&tab=review' : `/map?tree=${newTree.id}`,
      },
      userId
    );

    return res.status(201).json({
      success: true,
      message: check.verdict === 'TRUE' ? 'Tree registered successfully! 🌳' : 'Tree submitted. An admin will check the photo before it appears on the map.',
      data: newTree
    });
  } catch (error) {
    if (sendUploadError(res, error)) return;
    console.error('Error creating tree:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to register tree'
    });
  }
};

export const updateTree = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(404).json({ success: false, error: 'Tree not found' });
    }

    const parsed = updateTreeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: validationError(parsed.error)
      });
    }

    const { name, description, address, healthScore, plantedAt } = parsed.data;
    let category = null;
    if (parsed.data.categoryId) {
      category = await findCategory(parsed.data.categoryId);
      if (!category) return res.status(400).json({ success: false, error: 'That kind of tree is not available any more. Choose another.' });
    }

    const [existingTree] = await db.select().from(trees).where(eq(trees.id, id));

    if (!existingTree) {
      return res.status(404).json({
        success: false,
        error: 'Tree not found'
      });
    }

    if (existingTree.userId !== userId && !isAdminRole(req.userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can edit only trees registered by you'
      });
    }

    let photoUrl = existingTree.photoUrl;
    let photoPublicId = existingTree.photoPublicId;

    // A new photo has to pass the same check: a tree can't be swapped to a photo of something else
    let verificationStatus = existingTree.verificationStatus;
    let verificationNote = existingTree.verificationNote;
    const photoRef = parsed.data.photo;
    let newPhoto: { url: string; publicId: string } | null = null;
    if (photoRef) {
      newPhoto = await inspectUpload(userId, 'TREE', photoRef);
      const check = await checkPhoto(newPhoto, req.userRole, userId);
      if (check.verdict === 'FALSE') {
        await discardUploads([newPhoto.publicId]);
        return res.status(422).json({
          success: false,
          code: 'NOT_A_TREE',
          error: "That photo doesn't look like a tree or plant. Take a clear photo of the tree."
        });
      }
      verificationStatus = check.verdict === 'TRUE' ? 'VERIFIED' : 'PENDING';
      verificationNote = check.verdict === 'TRUE' ? null : check.note ?? null;
    }

    let updatedTree;
    try {
      updatedTree = await db.transaction(async (tx) => {
        if (photoRef) {
          const kept = await claimUpload(tx, userId, 'TREE', photoRef);
          photoUrl = kept.url;
          photoPublicId = kept.publicId;
          if (existingTree.photoPublicId) {
            // The planting entry in the care history shows the old picture: it goes too, so it isn't left broken
            await tx.update(careLogs).set({ photoUrl: null, photoPublicId: null }).where(and(eq(careLogs.treeId, id), eq(careLogs.photoPublicId, existingTree.photoPublicId)));
          }
        }
        const [row] = await tx.update(trees)
          .set({
            name: name !== undefined ? name : existingTree.name,
            species: category ? category.name : existingTree.species,
            categoryId: category ? category.id : existingTree.categoryId,
            description: description !== undefined ? description : existingTree.description,
            address: address !== undefined ? address : existingTree.address,
            healthScore: healthScore !== undefined ? healthScore : existingTree.healthScore,
            plantedAt: plantedAt ?? existingTree.plantedAt,
            waterEveryDays: parsed.data.waterEveryDays ?? existingTree.waterEveryDays,
            fertilizeEveryDays: parsed.data.fertilizeEveryDays ?? existingTree.fertilizeEveryDays,
            weedEveryDays: parsed.data.weedEveryDays ?? existingTree.weedEveryDays,
            photoUrl,
            photoPublicId,
            verificationStatus,
            verificationNote,
            updatedAt: new Date()
          })
          .where(eq(trees.id, id))
          .returning();
        return row;
      });
    } catch (err) {
      if (newPhoto) await discardUploads([newPhoto.publicId]);
      throw err;
    }

    // Only once the tree points at the new photo is the old one removed from Cloudinary
    if (newPhoto && existingTree.photoPublicId) await CloudinaryService.deleteImage(existingTree.photoPublicId);

    return res.status(200).json({
      success: true,
      message: 'Tree details updated successfully! ✨',
      data: updatedTree
    });
  } catch (error) {
    if (sendUploadError(res, error)) return;
    console.error('Error updating tree:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update tree'
    });
  }
};

export const deleteTree = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(404).json({ success: false, error: 'Tree not found' });
    }

    const [existingTree] = await db.select().from(trees).where(eq(trees.id, id));

    if (!existingTree) {
      return res.status(404).json({
        success: false,
        error: 'Tree not found'
      });
    }

    if (existingTree.userId !== userId && !isAdminRole(req.userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can delete only trees registered by you'
      });
    }

    // The care history goes with the tree, so its pictures must not be left behind on Cloudinary
    const careImages = await db
      .select({ publicId: careLogs.photoPublicId })
      .from(careLogs)
      .where(and(eq(careLogs.treeId, id), isNotNull(careLogs.photoPublicId)));

    await db.delete(trees).where(eq(trees.id, id));

    const images = new Set([existingTree.photoPublicId, ...careImages.map((c) => c.publicId)].filter((x): x is string => Boolean(x)));
    await Promise.all([...images].map((publicId) => CloudinaryService.deleteImage(publicId)));

    return res.status(200).json({
      success: true,
      message: 'Tree deleted successfully 🗑️'
    });
  } catch (error) {
    console.error('Error deleting tree:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete tree'
    });
  }
};

// ---------- Paged tree lists ----------

const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, '\\$&')}%`;

const browseQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  // Where you are: sorts by distance and enables the radius filter
  lat: latitudeSchema.optional(),
  lng: longitudeSchema.optional(),
  radius: z.coerce.number().positive().max(100_000).optional(),
  status: z.enum(TREE_STATUSES).default('all'),
  mine: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['nearest', 'newest', 'oldest', 'thirsty']).optional(),
  // Only trees in this category (also reached as /categories/:categoryId/trees)
  categoryId: z.string().uuid().optional(),
});

/** Metres from (lat, lng) to each tree, worked out in the database (haversine). */
const distanceFrom = (lat: number, lng: number) =>
  sql<number>`(6371000 * 2 * asin(sqrt(
    power(sin(radians(${trees.latitude} - ${lat}::double precision) / 2), 2) +
    cos(radians(${lat}::double precision)) * cos(radians(${trees.latitude})) *
    power(sin(radians(${trees.longitude} - ${lng}::double precision) / 2), 2)
  )))`;

/**
 * GET /trees/browse: one page of trees.
 * Filters: status (needs water / fertiliser / grass removal, or healthy: needs none), radius around lat/lng, mine (signed in), search
 * (name, kind or address). Sorted nearest first when lat/lng are given, otherwise newest planted.
 * With mine=true it also returns `summary` (how many of your trees there are, and how many need water).
 */
export const browseTrees = async (req: Request, res: Response) => {
  const parsed = browseQuery.safeParse({ ...req.query, ...(req.params.categoryId ? { categoryId: req.params.categoryId } : {}) });
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Invalid filters' });
  }
  const { page, limit, lat, lng, radius, status, mine, search, categoryId } = parsed.data;
  const here = lat !== undefined && lng !== undefined;
  const sort = parsed.data.sort ?? (here ? 'nearest' : 'newest');

  let userId: string | null = null;
  if (mine === 'true') {
    userId = getAuth(req).userId ?? null;
    if (!userId) return res.status(401).json({ success: false, error: 'Sign in to see your trees' });
  }

  try {
    const distance = here ? distanceFrom(lat, lng) : null;
    // Each tree is judged against its own watering interval
    const isThirsty = needsWater;

    // Verified trees for everyone; your own list also shows trees waiting for review
    const base: SQL[] = [visibleTrees(userId)];
    if (userId) base.push(eq(trees.userId, userId));
    if (categoryId) base.push(eq(trees.categoryId, categoryId));
    if (search) base.push(or(ilike(trees.name, likePattern(search)), ilike(trees.species, likePattern(search)), ilike(trees.address, likePattern(search)))!);
    if (distance && radius) base.push(sql`${distance} <= ${radius}`);

    const filters = [...base];
    // Only verified trees can need care
    const byStatus = statusCondition(status);
    if (byStatus) filters.push(and(byStatus, eq(trees.verificationStatus, 'VERIFIED'))!);
    const where = filters.length ? and(...filters) : undefined;

    const order =
      sort === 'nearest' && distance
        ? [asc(distance)]
        : sort === 'thirsty'
          ? [sql`${trees.lastWateredAt} asc nulls first`]
          : sort === 'oldest'
            ? [asc(trees.plantedAt)]
            : [desc(trees.plantedAt)];

    const [rows, [{ count }], summary] = await Promise.all([
      db
        .select({ tree: trees, ownerName: users.name, ownerAvatar: users.avatarUrl, ...(distance ? { distance } : {}) })
        .from(trees)
        .leftJoin(users, eq(users.id, trees.userId))
        .where(where)
        .orderBy(...order, desc(trees.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)` }).from(trees).where(where),
      // Your totals ignore the status filter, so the stat tiles stay the same while you switch it
      userId
        ? db
            .select({
              total: sql<number>`count(*)`,
              thirsty: sql<number>`count(*) filter (where ${isThirsty} and ${trees.verificationStatus} = 'VERIFIED')`,
              // Needs water, fertiliser or grass removal (the rest of the verified trees are healthy)
              needy: sql<number>`count(*) filter (where ${needsCare} and ${trees.verificationStatus} = 'VERIFIED')`,
            })
            .from(trees)
            .where(eq(trees.userId, userId))
        : Promise.resolve(null),
    ]);

    const total = Number(count);
    res.status(200).json({
      success: true,
      data: rows.map((r) => ({
        ...r.tree,
        owner: { id: r.tree.userId, name: r.ownerName, avatarUrl: r.ownerAvatar },
        ...('distance' in r ? { distance: Math.round(Number(r.distance)) } : {}),
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      ...(summary ? { summary: { total: Number(summary[0].total), thirsty: Number(summary[0].thirsty), needy: Number(summary[0].needy) } } : {}),
    });
  } catch (error) {
    console.error('Error browsing trees:', error);
    res.status(500).json({ success: false, error: 'Failed to load trees' });
  }
};
