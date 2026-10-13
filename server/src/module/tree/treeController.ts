import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { db } from '../../common/db';
import { trees, careLogs } from '../../common/db/schema';
import { eq } from 'drizzle-orm';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { z } from 'zod';
import { isUuid, latitudeSchema, longitudeSchema } from '../../common/utils/validation';

const createTreeSchema = z.object({
  name: z.string().trim().min(1).max(255),
  species: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional(),
  address: z.string().trim().max(500).optional(),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

const updateTreeSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  species: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).optional(),
  address: z.string().trim().max(500).optional(),
  healthScore: z.coerce.number().int().min(0).max(100).optional(),
});

const validationError = (error: z.ZodError) =>
  error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');

export const getAllTrees = async (req: Request, res: Response) => {
  try {
    const allTrees = await db.query.trees.findMany({
      with: {
        owner: {
          columns: {
            id: true,
            name: true,
            avatarUrl: true
          }
        },
        careLogs: {
          orderBy: (logs, { desc }) => [desc(logs.performedAt)],
          limit: 1
        }
      },
      orderBy: (treesTable, { desc }) => [desc(treesTable.createdAt)]
    });

    return res.status(200).json({
      success: true,
      count: allTrees.length,
      data: allTrees
    });
  } catch (error) {
    console.error('Error fetching trees:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch trees'
    });
  }
};

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
        careLogs: {
          orderBy: (logs, { desc }) => [desc(logs.performedAt)],
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

    if (!tree) {
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

    let photoUrl = 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=1000&q=80';
    let photoPublicId: string | undefined;

    if (req.file) {
      const upload = await CloudinaryService.uploadImage(req.file, 'plantree/trees');
      photoUrl = upload.url;
      photoPublicId = upload.publicId;
    }

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
      lastWateredAt: new Date(),
      healthScore: 100
    }).returning();

    await db.insert(careLogs).values({
      treeId: newTree.id,
      actionType: 'WATERED',
      notes: 'Initial planting & registration care log 🌿',
      photoUrl: newTree.photoUrl,
      photoPublicId: newTree.photoPublicId,
      userId,
      performedAt: new Date()
    });

    return res.status(201).json({
      success: true,
      message: 'Tree registered successfully! 🌳',
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

    const { name, species, description, address, healthScore } = parsed.data;

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

    if (req.file) {
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
        photoUrl,
        photoPublicId,
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
