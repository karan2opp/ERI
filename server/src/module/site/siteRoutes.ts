import { Router, Request, Response } from 'express';
import { getSettings } from '../../common/services/settingsService';

const router = Router();

/** GET /site: public settings for the site: the "Join the team" form, social links, contact details and the donation WhatsApp number ("" when not set). */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { joinTeamFormUrl, instagramUrl, youtubeUrl, contactEmail, contactPhone, donateWhatsapp } = await getSettings();
    // Not cached, so a link an admin has just saved shows up straight away
    res.set('Cache-Control', 'no-cache');
    res.status(200).json({ success: true, data: { joinTeamFormUrl, instagramUrl, youtubeUrl, contactEmail, contactPhone, donateWhatsapp } });
  } catch (err) {
    console.error('Error loading site settings:', err);
    res.status(500).json({ success: false, error: 'Failed to load the site settings' });
  }
});

export default router;
