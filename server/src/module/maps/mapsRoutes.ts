import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { searchPlaces, reverseGeocode, geocodeAddress } from './mapsController';

const router = Router();

// These endpoints proxy paid Google APIs without requiring sign-in, so cap per-IP usage.
const mapsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please slow down.' }
});

router.use(mapsLimiter);

router.get('/places', searchPlaces);
router.get('/reverse-geocode', reverseGeocode);
router.get('/geocode', geocodeAddress);

export default router;
