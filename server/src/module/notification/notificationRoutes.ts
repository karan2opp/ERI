import { Router } from 'express';
import { getNotificationConfig, subscribePush, unsubscribePush, getPreferences, setPreferences } from './notificationController';
import { requireAuth } from '../../common/middlewares/authMiddleware';

const router = Router();

// The public key is not a secret: the browser needs it to subscribe
router.get('/config', getNotificationConfig);

router.use(requireAuth);
router.get('/preferences', getPreferences);
router.put('/preferences', setPreferences);
router.post('/push/subscribe', subscribePush);
router.post('/push/unsubscribe', unsubscribePush);

export default router;
