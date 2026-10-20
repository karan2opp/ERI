import { Router } from 'express';
import { listCategories, getCategory, createCategory, updateCategory, deleteCategory } from './categoryController';
import { browseTrees } from '../tree/treeController';
import { requireAuth, requireAdmin } from '../../common/middlewares/authMiddleware';

const router = Router();

// Anyone can read categories and the trees in them, 10 per page by default
router.get('/', listCategories);
// The trees in one category: the same paged, filterable list as /trees/browse (search, distance, status, sort)
router.get('/:categoryId/trees', browseTrees);
router.get('/:id', getCategory);

// Only admins change them
router.post('/', requireAuth, requireAdmin, createCategory);
router.patch('/:id', requireAuth, requireAdmin, updateCategory);
router.delete('/:id', requireAuth, requireAdmin, deleteCategory);

export default router;
