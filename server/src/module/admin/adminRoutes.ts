import { Router } from 'express';
import { getAdminStats, getAdminUsers, getAdminUser, getAdminUserCare, getAdminTrees, getPendingTrees, reviewTree, setUserRole } from './adminController';
import { requireAuth, requireAdmin } from '../../common/middlewares/authMiddleware';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', getAdminStats);
router.get('/users', getAdminUsers);
router.get('/trees', getAdminTrees);
// Before any '/trees/:id' route so "pending" isn't read as an id
router.get('/trees/pending', getPendingTrees);
router.post('/trees/:id/review', reviewTree);
router.get('/users/:id', getAdminUser);
router.get('/users/:id/care', getAdminUserCare);
router.patch('/users/:id/role', setUserRole);

export default router;
