import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { isAdminRole } from '../../common/auth/roles';
import { MAX_MEDIA_BATCH, UPLOAD_KINDS, UploadError, discardOwnUpload, issueTickets } from '../../common/services/uploads';

const router = Router();

// Each signature lets someone put a photo on Cloudinary, which costs storage: cap how many one person can ask for
const signatureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  // Runs after requireAuth, so it is per person, not per network
  keyGenerator: (req) => (req as AuthenticatedRequest).userId ?? 'anonymous',
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, error: 'You have asked to upload a lot of photos in the last hour. Try again a bit later.' },
});

const fail = (res: Response, err: unknown, fallback: string) => {
  if (err instanceof UploadError) return res.status(err.status).json({ success: false, code: err.code, error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ success: false, error: fallback });
};

/**
 * POST /uploads/signature { kind: TREE | CARE | DRIVE | PLACE | MEDIA | VIDEO, count? }: signed permission to upload `count`
 * photos (or videos) straight to Cloudinary (the browser sends them there, never to this server). Drive pictures and
 * everything for the Media page are for admins only. Each photo is then attached with the id Cloudinary replies with.
 */
router.post('/signature', requireAuth, signatureLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z
    .object({ kind: z.enum(UPLOAD_KINDS), count: z.number().int().min(1).max(MAX_MEDIA_BATCH).default(1) })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Say what the photo is for, and how many' });
  const { kind, count } = parsed.data;
  if ((kind === 'DRIVE' || kind === 'MEDIA' || kind === 'VIDEO') && !isAdminRole(req.userRole)) return res.status(403).json({ success: false, error: 'Forbidden' });
  // Place suggestions take at most 5 pictures (the form checks that again)
  if (kind === 'PLACE' && count > 5) return res.status(400).json({ success: false, error: 'A place can have up to 5 pictures' });
  try {
    res.status(200).json({ success: true, data: await issueTickets(req.userId!, kind, count) });
  } catch (err) {
    fail(res, err, 'Could not prepare the upload');
  }
});

/** POST /uploads/discard { publicId }: throws away a photo you uploaded but did not use (for example after a retake). */
router.post('/discard', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ publicId: z.string().min(1).max(255) }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Say which photo' });
  try {
    // Someone else's photo, or one already used, is simply "not found": it is never touched
    const removed = await discardOwnUpload(req.userId!, parsed.data.publicId);
    res.status(removed ? 200 : 404).json({ success: removed, ...(removed ? {} : { error: 'Photo not found' }) });
  } catch (err) {
    fail(res, err, 'Could not remove the photo');
  }
});

export default router;
