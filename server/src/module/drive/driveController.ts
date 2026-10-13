import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../common/db';
import { drives } from '../../common/db/schema';
import { desc, eq } from 'drizzle-orm';
import { isUuid } from '../../common/utils/validation';

const httpUrl = z.string().max(1000).url().refine(u => /^https?:\/\//i.test(u), 'Must be an http(s) URL');

const createDriveSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(5000),
  date: z.string().trim().min(1).max(20),
  time: z.string().trim().min(1).max(20),
  // JSON body, so real numbers only (no coercion of "" or null to 0)
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().trim().max(500).optional(),
  googleMapsUrl: httpUrl.optional().or(z.literal('').transform(() => undefined)),
});

export const createDrive = async (req: Request, res: Response) => {
  const parsed = createDriveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    });
  }

  try {
    const newDrive = await db.insert(drives).values(parsed.data).returning();
    res.status(201).json({ success: true, data: newDrive[0] });
  } catch (err) {
    console.error('Error creating drive:', err);
    res.status(500).json({ success: false, error: 'Failed to create drive' });
  }
};

export const getDrives = async (req: Request, res: Response) => {
  try {
    const allDrives = await db.select().from(drives).orderBy(desc(drives.createdAt));
    res.status(200).json({ success: true, data: allDrives });
  } catch (err) {
    console.error('Error fetching drives:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch drives' });
  }
};

export const getDriveById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(404).json({ success: false, error: 'Drive not found' });
    }
    const drive = await db.select().from(drives).where(eq(drives.id, id));
    if (!drive || drive.length === 0) {
      return res.status(404).json({ success: false, error: 'Drive not found' });
    }
    res.status(200).json({ success: true, data: drive[0] });
  } catch (err) {
    console.error('Error fetching drive by id:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch drive' });
  }
};
