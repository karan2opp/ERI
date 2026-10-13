import { Router } from 'express';
import { addCareLog, getTreeCareHistory } from './careController';
import { requireAuth } from '../../common/middlewares/authMiddleware';
import { uploadSingleImage } from '../../common/middlewares/uploadMiddleware';

const router = Router({ mergeParams: true });

router.get('/', getTreeCareHistory);
router.post('/', requireAuth, uploadSingleImage, addCareLog);

export default router;
