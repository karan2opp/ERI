import { Router } from 'express';
import { createDrive, getDrives, getDriveById, getDriveCalendar } from './driveController';
import { requireAuth, requireAdmin, requireTeam } from '../../common/middlewares/authMiddleware';

const router = Router();

router.post('/', requireAuth, requireAdmin, createDrive);
// Reading the schedule needs a team member or admin; scheduling a drive needs an admin
router.get('/', requireAuth, requireTeam, getDrives);
// Before '/:id' so "calendar" isn't read as an id
router.get('/calendar', requireAuth, requireTeam, getDriveCalendar);
router.get('/:id', requireAuth, requireTeam, getDriveById);

export default router;
