import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getTreeById,
  createTree,
  updateTree,
  deleteTree,
  browseTrees
} from './treeController';
import { checkTreePhoto } from './treeController';
import { getTreePins } from './pinsController';
import {
  addCareLog,
  getTreeCareHistory,
  replaceCarePhoto,
  removeCarePhoto
} from '../care/careController';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { photoNeedsCheck } from '../../common/services/settingsService';
import { uploadSingleImage } from '../../common/middlewares/uploadMiddleware';

const router = Router();

// Every new tree photo is checked by an AI model, which costs money: cap how many one person can send
const photoChecksLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  // A tree's photo is checked once when it is taken and the answer is reused at planting, but retakes count
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  // Runs after requireAuth, so it is per person, not per network
  // Photos that aren't sent to the AI cost nothing, so they aren't limited
  skip: async (req) => !(await photoNeedsCheck((req as AuthenticatedRequest).userRole)),
  keyGenerator: (req) => (req as AuthenticatedRequest).userId ?? 'anonymous',
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, error: 'You have sent a lot of photos in the last hour. Try again a bit later.' },
});

// Public Map Routes
// Paged lists; before '/:id' so "browse" isn't read as an id
router.get('/browse', browseTrees);
// What the map draws: pins in view (or clusters when zoomed out), or every tree within a distance
router.get('/pins', getTreePins);
// A tree waiting for review is only shown to its owner and admins, so it needs to know who's asking
router.get('/:id', optionalAuth, getTreeById);
router.get('/:treeId/care', getTreeCareHistory);

// Authenticated Routes
// Checks a photo the moment it is taken
router.post('/check-photo', requireAuth, photoChecksLimiter, uploadSingleImage, checkTreePhoto);
router.post('/', requireAuth, photoChecksLimiter, uploadSingleImage, createTree);
router.put('/:id', requireAuth, photoChecksLimiter, uploadSingleImage, updateTree);
router.delete('/:id', requireAuth, deleteTree);
router.post('/:treeId/care', requireAuth, uploadSingleImage, addCareLog);
// Changing the photo of a care entry: the tree's owner or an admin (checked in the controller)
router.put('/:treeId/care/:logId/photo', requireAuth, uploadSingleImage, replaceCarePhoto);
router.delete('/:treeId/care/:logId/photo', requireAuth, removeCarePhoto);

export default router;
