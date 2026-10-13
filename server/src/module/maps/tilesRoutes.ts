import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getTile, tilesStatus } from './tilesController';

const router = Router();

// A map screen loads dozens of tiles and panning loads more, so this limit is much higher than
// the search/geocode one; it only stops someone scraping tiles through our key.
const tilesLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

router.use(tilesLimiter);

router.get('/status', tilesStatus);
router.get('/:style/:z/:x/:y', getTile);

export default router;
