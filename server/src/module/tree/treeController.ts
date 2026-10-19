import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { db } from '../../common/db';
import { trees, careLogs, users } from '../../common/db/schema';
import { and, asc, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { getAuth } from '@clerk/express';
import { needsWater } from '../../common/utils/careSchedule';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { z } from 'zod';
import { isUuid, latitudeSchema, longitudeSchema } from '../../common/utils/validation';
import { verifyTreePhoto } from '../../common/services/treeVerifier';
import { checkPlantingLocation } from '../../common/utils/treePolicy';
import { photoNeedsCheck } from '../../common/services/settingsService';
import { isAdminRole } from '../../common/auth/roles';

/** The AI photo check, unless settings say this person's photos aren't checked (then it counts as a pass). */
const checkPhoto = async (file: Express.Multer.File, role: string | undefined) =>
  (await photoNeedsCheck(role)) ? verifyTreePhoto(file) : { verdict: 'TRUE' as const, note: undefined };

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
  species: z.string().trim().min(1).max(255),
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
});

const updateTreeSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  species: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).optional(),
  address: z.string().trim().max(500).optional(),
  healthScore: z.coerce.number().int().min(0).max(100).optional(),
  plantedAt: plantedAtSchema.optional(),
  waterEveryDays: intervalDays.optional(),
  fertilizeEveryDays: intervalDays.optional(),
  weedEveryDays: intervalDays.optional(),
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

    const { name, species, description, latitude, longitude, address } = parsed.data;

    // 1. The person has to be standing at the tree (cheap, so it goes before the photo check)
    const tooFar = checkPlantingLocation(
      { latitude, longitude },
      { latitude: parsed.data.deviceLatitude, longitude: parsed.data.deviceLongitude, accuracy: parsed.data.deviceAccuracy }
    );
    if (tooFar) {
      return res.status(422).json({ success: false, code: 'TOO_FAR', error: tooFar });
    }

    // 2. A photo is required, and it has to show a tree or plant
    if (!req.file) {
      return res.status(400).json({ success: false, code: 'PHOTO_REQUIRED', error: 'Take a photo of the tree to register it' });
    }
    const check = await checkPhoto(req.file, req.userRole);
    if (check.verdict === 'FALSE') {
      // Nothing is saved or uploaded
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

    const upload = await CloudinaryService.uploadImage(req.file, 'plantree/trees');
    const photoUrl = upload.url;
    const photoPublicId = upload.publicId;

    const [newTree] = await db.insert(trees).values({
      name,
      species,
      description: description || '',
      photoUrl,
      photoPublicId,
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

    await db.insert(careLogs).values({
      treeId: newTree.id,
      actionType: justPlanted ? 'WATERED' : 'INSPECTED',
      notes: justPlanted ? 'Planted and watered' : 'Added to the map',
      photoUrl: newTree.photoUrl,
      photoPublicId: newTree.photoPublicId,
      userId,
      performedAt: justPlanted ? plantedAt : now
    });

    return res.status(201).json({
      success: true,
      message: check.verdict === 'TRUE' ? 'Tree registered successfully! 🌳' : 'Tree submitted. An admin will check the photo before it appears on the map.',
      data: newTree
    });
  } catch (error) {
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

    const { name, species, description, address, healthScore, plantedAt } = parsed.data;

    const [existingTree] = await db.select().from(trees).where(eq(trees.id, id));

    if (!existingTree) {
      return res.status(404).json({
        success: false,
        error: 'Tree not found'
      });
    }

    if (existingTree.userId !== userId) {
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
    if (req.file) {
      const check = await checkPhoto(req.file, req.userRole);
      if (check.verdict === 'FALSE') {
        return res.status(422).json({
          success: false,
          code: 'NOT_A_TREE',
          error: "That photo doesn't look like a tree or plant. Take a clear photo of the tree."
        });
      }
      verificationStatus = check.verdict === 'TRUE' ? 'VERIFIED' : 'PENDING';
      verificationNote = check.verdict === 'TRUE' ? null : check.note ?? null;

      const upload = await CloudinaryService.uploadImage(req.file, 'plantree/trees');
      photoUrl = upload.url;
      
      if (existingTree.photoPublicId) {
        await CloudinaryService.deleteImage(existingTree.photoPublicId);
      }
      photoPublicId = upload.publicId;
    }

    const [updatedTree] = await db.update(trees)
      .set({
        name: name !== undefined ? name : existingTree.name,
        species: species !== undefined ? species : existingTree.species,
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

    return res.status(200).json({
      success: true,
      message: 'Tree details updated successfully! ✨',
      data: updatedTree
    });
  } catch (error) {
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

    if (existingTree.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can delete only trees registered by you'
      });
    }

    if (existingTree.photoPublicId) {
      await CloudinaryService.deleteImage(existingTree.photoPublicId);
    }

    await db.delete(trees).where(eq(trees.id, id));

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
  status: z.enum(['all', 'thirsty', 'healthy']).default('all'),
  mine: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['nearest', 'newest', 'oldest', 'thirsty']).optional(),
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
 * Filters: status (needs water / healthy), radius around lat/lng, mine (signed in), search
 * (name, kind or address). Sorted nearest first when lat/lng are given, otherwise newest planted.
 * With mine=true it also returns `summary` (how many of your trees there are, and how many need water).
 */
export const browseTrees = async (req: Request, res: Response) => {
  const parsed = browseQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Invalid filters' });
  }
  const { page, limit, lat, lng, radius, status, mine, search } = parsed.data;
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
    if (search) base.push(or(ilike(trees.name, likePattern(search)), ilike(trees.species, likePattern(search)), ilike(trees.address, likePattern(search)))!);
    if (distance && radius) base.push(sql`${distance} <= ${radius}`);

    const filters = [...base];
    // Only verified trees can need water
    if (status === 'thirsty') filters.push(and(isThirsty, eq(trees.verificationStatus, 'VERIFIED'))!);
    if (status === 'healthy') filters.push(and(sql`NOT ${needsWater}`, eq(trees.verificationStatus, 'VERIFIED'))!);
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
            .select({ total: sql<number>`count(*)`, thirsty: sql<number>`count(*) filter (where ${isThirsty} and ${trees.verificationStatus} = 'VERIFIED')` })
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
      ...(summary ? { summary: { total: Number(summary[0].total), thirsty: Number(summary[0].thirsty) } } : {}),
    });
  } catch (error) {
    console.error('Error browsing trees:', error);
    res.status(500).json({ success: false, error: 'Failed to load trees' });
  }
};
