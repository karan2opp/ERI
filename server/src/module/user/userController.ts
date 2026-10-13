import { Response } from 'express';
import { clerkClient } from '@clerk/express';
import { eq } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { db } from '../../common/db';
import { users } from '../../common/db/schema';

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
