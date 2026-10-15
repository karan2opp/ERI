import { Request, Response, NextFunction } from 'express';
import { clerkClient, getAuth } from '@clerk/express';
import { db } from '../db';
import { users, User } from '../db/schema';
import { eq } from 'drizzle-orm';
import { canSeeTeamDrives } from '../auth/roles';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  user?: User;
}

/**
 * Identity comes only from the Clerk session verified by clerkMiddleware().
 * Request headers such as x-user-id are never trusted.
 */
export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. Please sign in to access this feature.'
      });
    }

    let [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      // First request from this Clerk user: mirror their profile into our users table.
      const clerkUser = await clerkClient.users.getUser(userId);
      const email = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
        ?? clerkUser.emailAddresses[0]?.emailAddress;

      if (!email) {
        return res.status(401).json({ success: false, error: 'Account has no email address' });
      }

      const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email.split('@')[0];

      await db.insert(users).values({
        id: userId,
        email,
        name,
        avatarUrl: clerkUser.imageUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`
      }).onConflictDoNothing();

      [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user) {
        // The insert was skipped: another row already owns this email (e.g. a legacy dev account).
        return res.status(409).json({
          success: false,
          error: 'An account with this email already exists under a different sign-in'
        });
      }
    }

    req.user = user;
    req.userId = user.id;
    req.userEmail = user.email;
    req.userName = user.name ?? undefined;
    req.userRole = user.role;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/** Must run after requireAuth. The role is read from the database, never from the client. */
export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.userRole !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
};

/** Must run after requireAuth. Team members and admins only (the planting drive schedule). */
export const requireTeam = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!canSeeTeamDrives(req.userRole)) {
    return res.status(403).json({ success: false, error: 'This is for team members and admins' });
  }
  next();
};

/**
 * Like requireAuth, but never refuses: if the visitor is signed in it fills in userId and userRole
 * (it does not create accounts), otherwise they carry on as a signed-out visitor. Used where
 * the answer depends on who is asking (which drives you may see).
 */
export const optionalAuth = async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user) {
        req.user = user;
        req.userId = user.id;
        req.userRole = user.role;
      }
    }
  } catch {
    // Treat a failed lookup as signed out: they simply see fewer drives
  }
  next();
};
