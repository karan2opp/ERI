import { Router } from 'express';
import { getAdminStats, getAdminUsers, getAdminTrees } from './adminController';
import { requireAuth, requireAdmin } from '../../common/middlewares/authMiddleware';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', getAdminStats);
router.get('/users', getAdminUsers);
router.get('/trees', getAdminTrees);

export default router;
