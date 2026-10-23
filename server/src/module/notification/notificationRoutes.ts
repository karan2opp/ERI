import { Router } from 'express';
import { getNotificationConfig, subscribePush, unsubscribePush, getPreferences, setPreferences } from './notificationController';
import { requireAuth } from '../../common/middlewares/authMiddleware';
import { getInbox, getUnreadCount, markAllRead, markRead } from './inboxController';

const router = Router();

// The public key is not a secret: the browser needs it to subscribe
router.get('/config', getNotificationConfig);

router.use(requireAuth);
router.get('/preferences', getPreferences);
router.put('/preferences', setPreferences);
router.post('/push/subscribe', subscribePush);
router.post('/push/unsubscribe', unsubscribePush);

// The bell: your own notifications only
router.get('/inbox', getInbox);
router.get('/inbox/unread-count', getUnreadCount);
router.post('/inbox/read-all', markAllRead);
router.post('/inbox/:id/read', markRead);

export default router;
