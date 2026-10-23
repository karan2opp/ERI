import { Request, Response, NextFunction } from 'express';
import { clerkClient, getAuth } from '@clerk/express';
import { db } from '../db';
import { users, User } from '../db/schema';
import { eq } from 'drizzle-orm';
import { canSeeTeamDrives, isAdminRole } from '../auth/roles';
import { normalizeName, splitName, uniqueName } from '../utils/userName';

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

      // Names are unique: if someone already has this one ("Ravi Kumar"), this person becomes "Ravi Kumar 2"
      const wanted = normalizeName([clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')) || email.split('@')[0];
      let name = await uniqueName(wanted);
      // A first visit sends several requests at once; only the one that really creates the row does the extras below
      let createdHere = false;

      for (let attempt = 0; attempt < 5 && !user; attempt++) {
        const inserted = await db.insert(users).values({
          id: userId,
          email,
          name,
          avatarUrl: clerkUser.imageUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`
        }).onConflictDoNothing().returning({ id: users.id });
        createdHere = inserted.length > 0;

        [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

        if (!user) {
          const [sameEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
          if (sameEmail) {
            // Another row already owns this email (e.g. a legacy dev account).
            return res.status(409).json({
              success: false,
              error: 'An account with this email already exists under a different sign-in'
            });
          }
          // Not the email, so someone took this name a moment ago: pick the next free one
          name = await uniqueName(wanted);
        }
      }

      if (!user) {
        return res.status(503).json({ success: false, error: 'Could not set up your account just now. Try again.' });
      }

      if (createdHere) {
        // Show the same name on the Account page as everyone else sees
        if (user.name !== wanted && user.name) {
          clerkClient.users.updateUser(userId, splitName(user.name)).catch((err) => console.warn('Could not update the name in Clerk:', err));
        }
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
  if (!isAdminRole(req.userRole)) {
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
