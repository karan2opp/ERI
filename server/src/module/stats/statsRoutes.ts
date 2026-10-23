import { Router } from 'express';
import { getSiteStats } from './statsController';

const router = Router();

// Public: the home page's four numbers
router.get('/', getSiteStats);

export default router;
