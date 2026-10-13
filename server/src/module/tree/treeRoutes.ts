import { Router } from 'express';
import {
  getAllTrees,
  getTreeById,
  createTree,
  updateTree,
  deleteTree
} from './treeController';
import {
  addCareLog,
  getTreeCareHistory
} from '../care/careController';
import { requireAuth } from '../../common/middlewares/authMiddleware';
import { uploadSingleImage } from '../../common/middlewares/uploadMiddleware';

const router = Router();

// Public Map Routes
router.get('/', getAllTrees);
router.get('/:id', getTreeById);
router.get('/:treeId/care', getTreeCareHistory);

// Authenticated Routes
router.post('/', requireAuth, uploadSingleImage, createTree);
router.put('/:id', requireAuth, uploadSingleImage, updateTree);
router.delete('/:id', requireAuth, deleteTree);
router.post('/:treeId/care', requireAuth, uploadSingleImage, addCareLog);

export default router;
