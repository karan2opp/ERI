import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../common/middlewares/authMiddleware';
import { addMedia, deleteMedia, getMedia, updateMedia } from './mediaController';

const router = Router();

// Anyone can look at the Media page
router.get('/', getMedia);

// Adding, captioning and removing is for admins
router.post('/', requireAuth, requireAdmin, addMedia);
router.patch('/:id', requireAuth, requireAdmin, updateMedia);
router.delete('/:id', requireAuth, requireAdmin, deleteMedia);

export default router;
