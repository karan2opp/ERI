import { Router } from 'express';
import { createDrive, getDrives, getDriveById, getDriveCalendar, updateDrive, deleteDrive } from './driveController';
import { completeDrive, reopenDrive, getDrivePhotos, addDrivePhoto, replaceDrivePhoto, deleteDrivePhoto } from './driveWrapUpController';
import { requireAuth, requireAdmin, optionalAuth } from '../../common/middlewares/authMiddleware';
import { uploadSingleImage } from '../../common/middlewares/uploadMiddleware';

const router = Router();

// Scheduling and changing a drive needs an admin
router.post('/', requireAuth, requireAdmin, createDrive);
router.patch('/:id', requireAuth, requireAdmin, updateDrive);
router.delete('/:id', requireAuth, requireAdmin, deleteDrive);

// Wrapping a drive up: pictures, and marking it completed (its summary is saved with PATCH)
router.post('/:id/complete', requireAuth, requireAdmin, completeDrive);
router.post('/:id/reopen', requireAuth, requireAdmin, reopenDrive);
router.post('/:id/photos', requireAuth, requireAdmin, uploadSingleImage, addDrivePhoto);
router.put('/:id/photos/:photoId', requireAuth, requireAdmin, uploadSingleImage, replaceDrivePhoto);
router.delete('/:id/photos/:photoId', requireAuth, requireAdmin, deleteDrivePhoto);

// Reading depends on who's asking: drives for everyone are open to anyone (even signed out),
// team-only drives need a team member or admin, and admins see all. The controller applies that.
router.get('/', optionalAuth, getDrives);
// Before '/:id' so "calendar" isn't read as an id
router.get('/calendar', optionalAuth, getDriveCalendar);
router.get('/:id', optionalAuth, getDriveById);
router.get('/:id/photos', optionalAuth, getDrivePhotos);

export default router;
