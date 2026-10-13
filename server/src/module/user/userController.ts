import { Response } from 'express';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';

/**
 * requireAuth has already created/loaded the user row from the verified Clerk session,
 * so syncing is just returning it. The client reads `role` from here — it never decides it.
 * Admins are promoted manually in the database (users.role = 'ADMIN').
 */
export const syncUserController = async (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({
    success: true,
    data: req.user
  });
};
