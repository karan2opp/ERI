import { Router } from 'express';
import { createDrive, getDrives, getDriveById, getDriveCalendar } from './driveController';
import { requireAuth, requireAdmin } from '../../common/middlewares/authMiddleware';

const router = Router();

router.post('/', requireAuth, requireAdmin, createDrive);
router.get('/', getDrives);
// Before '/:id' so "calendar" isn't read as an id
router.get('/calendar', getDriveCalendar);
router.get('/:id', getDriveById);

export default router;
