import { Router } from 'express';
import { createDrive, getDrives, getDriveById } from './driveController';
import { requireAuth, requireAdmin } from '../../common/middlewares/authMiddleware';

const router = Router();

router.post('/', requireAuth, requireAdmin, createDrive);
router.get('/', getDrives);
router.get('/:id', getDriveById);

export default router;
