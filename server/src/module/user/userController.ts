import { Response } from 'express';
import { clerkClient } from '@clerk/express';
import { eq } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { db } from '../../common/db';
import { users } from '../../common/db/schema';
import { z } from 'zod';
import { normalizePhone } from '../../common/utils/phone';

/**
 * requireAuth has already created/loaded the user row from the verified Clerk session.
 * Syncing also copies the latest name and photo from Clerk (people edit them on the Account page),
 * so trees and care logs show the current ones. The role is never touched here: admins are
 * promoted manually in the database (users.role = 'ADMIN').
 */
export const syncUserController = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  try {
    const clerkUser = await clerkClient.users.getUser(user.id);
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || user.name;
    const avatarUrl = clerkUser.imageUrl || user.avatarUrl;

    if (name !== user.name || avatarUrl !== user.avatarUrl) {
      const [updated] = await db
        .update(users)
        .set({ name, avatarUrl, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      return res.status(200).json({ success: true, data: updated });
    }
  } catch (err) {
    // Clerk unreachable: carry on with what we have
    console.warn('Profile refresh from Clerk failed:', err);
  }
  return res.status(200).json({ success: true, data: user });
};

/**
 * PUT /users/me/phone  { phone: "+91 98765 43210" | "" | null }
 * Saves your phone number (or removes it when empty). It isn't verified. Only you and admins can see it.
 */
export const setMyPhoneController = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ phone: z.string().max(40).nullable() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'phone must be text or empty' });
  }

  const raw = parsed.data.phone?.trim() ?? '';
  let phone: string | null = null;
  if (raw) {
    phone = normalizePhone(raw);
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'That doesn\'t look like a phone number. Include the country code, like +91 98765 43210.'
      });
    }
  }

  try {
    const [updated] = await db
      .update(users)
      .set({ phone, updatedAt: new Date() })
      .where(eq(users.id, req.userId!))
      .returning();
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('Error saving phone number:', err);
    return res.status(500).json({ success: false, error: 'Failed to save your phone number' });
  }
};
