import { Router } from 'express';
import { syncUserController, setMyPhoneController } from './userController';
import { requireAuth } from '../../common/middlewares/authMiddleware';

const router = Router();

router.post('/sync', requireAuth, syncUserController);
router.put('/me/phone', requireAuth, setMyPhoneController);

export default router;
