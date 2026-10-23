import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { syncUserController, setMyNameController, setMyPhoneController, requestPasswordResetController, confirmPasswordResetController } from './userController';
import { requireAuth, type AuthenticatedRequest } from '../../common/middlewares/authMiddleware';

const router = Router();

router.post('/sync', requireAuth, syncUserController);
router.put('/me/phone', requireAuth, setMyPhoneController);

// Changing your name: names are unique, so this also answers "is it taken"; limited so it can't be used to list names
const nameLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).userId ?? 'anonymous',
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, error: 'You have changed your name a lot. Try again in an hour.' },
});
router.put('/me/name', requireAuth, nameLimiter, setMyNameController);

// Password reset by emailed code. Per person (after sign-in), on top of the one-minute wait between codes
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).userId ?? 'anonymous',
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, error: 'Too many attempts. Try again in an hour.' },
});
router.post('/me/password-reset', requireAuth, resetLimiter, requestPasswordResetController);
router.post('/me/password-reset/confirm', requireAuth, resetLimiter, confirmPasswordResetController);

export default router;
