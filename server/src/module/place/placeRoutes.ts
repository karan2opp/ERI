import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createPlaceForm, createSuggestion, deletePlaceForm, deleteSuggestion, getPlaceForm, listPlaceForms, listSuggestions, updatePlaceForm } from './placeController';
import { optionalAuth, requireAdmin, requireAuth, type AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { uploadPhotos } from '../../common/middlewares/uploadMiddleware';

const router = Router();

// Each place carries up to 5 pictures, which cost storage: cap how many one person can send
const suggestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Runs after requireAuth, so it is per person, not per network
  keyGenerator: (req) => (req as AuthenticatedRequest).userId ?? 'anonymous',
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, error: 'You have sent a lot of places in the last hour. Try again a bit later.' },
});

// Anyone can read the forms (admins also get how many places came in)
router.get('/', optionalAuth, listPlaceForms);
router.get('/:id', optionalAuth, getPlaceForm);

// Admins make, change, open and close, and delete forms
router.post('/', requireAuth, requireAdmin, createPlaceForm);
router.patch('/:id', requireAuth, requireAdmin, updatePlaceForm);
router.delete('/:id', requireAuth, requireAdmin, deletePlaceForm);

// Signed-in people send places; only admins see them
router.post('/:id/suggestions', requireAuth, suggestLimiter, uploadPhotos, createSuggestion);
router.get('/:id/suggestions', requireAuth, requireAdmin, listSuggestions);
router.delete('/:id/suggestions/:suggestionId', requireAuth, requireAdmin, deleteSuggestion);

export default router;
