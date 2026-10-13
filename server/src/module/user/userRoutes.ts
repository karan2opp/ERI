import { Router } from 'express';
import { syncUserController } from './userController';
import { requireAuth } from '../../common/middlewares/authMiddleware';

const router = Router();

router.post('/sync', requireAuth, syncUserController);

export default router;
