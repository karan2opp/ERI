import { eq } from 'drizzle-orm';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { isAdminRole } from '../auth/roles';

/** App-wide settings that admins can change in Admin > Settings. */
export interface AppSettings {
  /** Send normal users' tree photos to the AI photo check */
  verifyUserPhotos: boolean;
  /** Send team members' tree photos to the AI photo check */
  verifyTeamPhotos: boolean;
  /** How many pictures an admin can add to one drive */
  drivePhotoLimit: number;
  /**
   * The starting numbers on the home page: what the NGO had done before the app. The page shows these plus what
   * the app counts (verified trees, held drives, and the waste admins record when they complete clean-up drives).
   */
  baselineTrees: number;
  baselinePlantationDrives: number;
  baselineCleanupDrives: number;
  baselineWasteKg: number;
  /** The Google Form people fill in to join the team; the home page shows a "Join the team" button when it is set */
  joinTeamFormUrl: string;
  /** Public links and contact details for the site's footer and Donate page ("" until an admin sets them) */
  instagramUrl: string;
  youtubeUrl: string;
  contactEmail: string;
  /** Phone numbers are kept in international form, like "+919876543210" */
  contactPhone: string;
  /** The WhatsApp number the Donate page's button opens a chat with */
  donateWhatsapp: string;
}

const SWITCH_KEYS = ['verifyUserPhotos', 'verifyTeamPhotos'] as const;

export const DRIVE_PHOTO_LIMIT_MIN = 1;
export const DRIVE_PHOTO_LIMIT_MAX = 50;
export const IMPACT_MAX = 100_000_000;

/** The starting numbers, as numbers an admin can change (key, what the app starts with). */
export const BASELINE_DEFAULTS = {
  baselineTrees: 616,
  baselinePlantationDrives: 18,
  baselineCleanupDrives: 8,
  baselineWasteKg: 300,
} as const;
export type BaselineKey = keyof typeof BASELINE_DEFAULTS;
const BASELINE_KEYS = Object.keys(BASELINE_DEFAULTS) as BaselineKey[];
const isBaselineKey = (key: string): key is BaselineKey => key in BASELINE_DEFAULTS;

// Normal users are checked; team members are trusted. Admins and super admins are never checked.
const DEFAULTS: AppSettings = {
  verifyUserPhotos: true,
  verifyTeamPhotos: false,
  drivePhotoLimit: 10,
  ...BASELINE_DEFAULTS,
  joinTeamFormUrl: '',
  instagramUrl: '',
  youtubeUrl: '',
  contactEmail: '',
  contactPhone: '',
  donateWhatsapp: '',
};

const isHttps = (v: string) => /^https:\/\/\S+$/i.test(v);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone = (v: string) => /^\+[1-9]\d{7,14}$/.test(v);

/** Settings that are text, with what a stored value must look like before it is handed out (anything else counts as not set). */
const TEXT_KEYS = {
  joinTeamFormUrl: isHttps,
  instagramUrl: isHttps,
  youtubeUrl: isHttps,
  contactEmail: isEmail,
  contactPhone: isPhone,
  donateWhatsapp: isPhone,
} as const;
type TextKey = keyof typeof TEXT_KEYS;
const isTextKey = (key: string): key is TextKey => key in TEXT_KEYS;

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(appSettings);
  const settings = { ...DEFAULTS };
  for (const row of rows) {
    if ((SWITCH_KEYS as readonly string[]).includes(row.key)) {
      settings[row.key as (typeof SWITCH_KEYS)[number]] = row.value === 'true';
    } else if (row.key === 'drivePhotoLimit') {
      const n = Number(row.value);
      if (Number.isInteger(n) && n >= DRIVE_PHOTO_LIMIT_MIN && n <= DRIVE_PHOTO_LIMIT_MAX) settings.drivePhotoLimit = n;
    } else if (isBaselineKey(row.key)) {
      const n = Number(row.value);
      if (Number.isInteger(n) && n >= 0 && n <= IMPACT_MAX) settings[row.key] = n;
    } else if (isTextKey(row.key)) {
      settings[row.key] = TEXT_KEYS[row.key](row.value) ? row.value : '';
    }
  }
  return settings;
}

const save = (key: string, value: string, userId: string) =>
  db
    .insert(appSettings)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });

export async function updateSettings(patch: Partial<AppSettings>, userId: string): Promise<AppSettings> {
  for (const key of SWITCH_KEYS) {
    const value = patch[key];
    if (value !== undefined) await save(key, String(value), userId);
  }
  if (patch.drivePhotoLimit !== undefined) await save('drivePhotoLimit', String(patch.drivePhotoLimit), userId);
  for (const key of Object.keys(TEXT_KEYS) as TextKey[]) {
    if (patch[key] !== undefined) await save(key, patch[key]!, userId);
  }
  for (const key of BASELINE_KEYS) {
    if (patch[key] !== undefined) await save(key, String(patch[key]), userId);
  }
  return getSettings();
}

/** Whether a photo from someone with this role goes to the AI check. Admins and super admins never do. */
export async function photoNeedsCheck(role: string | undefined): Promise<boolean> {
  if (isAdminRole(role)) return false;
  const settings = await getSettings();
  return role === 'TEAM_MEMBER' ? settings.verifyTeamPhotos : settings.verifyUserPhotos;
}

/**
 * Runs when the server starts: puts the starting numbers into the database the first time (616 trees, 18
 * plantation drives, 8 clean-up drives and 300 kg of waste from before the app), so they are stored data an
 * admin can change in Settings, not only defaults in the code. A value that is already saved is never touched.
 */
export async function ensureBaselineNumbers(): Promise<void> {
  try {
    await db
      .insert(appSettings)
      .values(BASELINE_KEYS.map((key) => ({ key, value: String(BASELINE_DEFAULTS[key]) })))
      .onConflictDoNothing();
  } catch (err) {
    console.error('Could not save the starting numbers:', err instanceof Error ? err.message : err);
  }
}
