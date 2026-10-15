import { Router } from 'express';
import { createDrive, getDrives, getDriveById, getDriveCalendar, updateDriveSettings } from './driveController';
import { requireAuth, requireAdmin, optionalAuth } from '../../common/middlewares/authMiddleware';

const router = Router();

// Scheduling and changing a drive needs an admin
router.post('/', requireAuth, requireAdmin, createDrive);
router.patch('/:id', requireAuth, requireAdmin, updateDriveSettings);

// Reading depends on who's asking: drives for everyone are open to anyone (even signed out),
// team-only drives need a team member or admin, and admins see all. The controller applies that.
router.get('/', optionalAuth, getDrives);
// Before '/:id' so "calendar" isn't read as an id
router.get('/calendar', optionalAuth, getDriveCalendar);
router.get('/:id', optionalAuth, getDriveById);

export default router;
