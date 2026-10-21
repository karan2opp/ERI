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
}

const SWITCH_KEYS = ['verifyUserPhotos', 'verifyTeamPhotos'] as const;

export const DRIVE_PHOTO_LIMIT_MIN = 1;
export const DRIVE_PHOTO_LIMIT_MAX = 50;

// Normal users are checked; team members are trusted. Admins and super admins are never checked.
const DEFAULTS: AppSettings = { verifyUserPhotos: true, verifyTeamPhotos: false, drivePhotoLimit: 10 };

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(appSettings);
  const settings = { ...DEFAULTS };
  for (const row of rows) {
    if ((SWITCH_KEYS as readonly string[]).includes(row.key)) {
      settings[row.key as (typeof SWITCH_KEYS)[number]] = row.value === 'true';
    } else if (row.key === 'drivePhotoLimit') {
      const n = Number(row.value);
      if (Number.isInteger(n) && n >= DRIVE_PHOTO_LIMIT_MIN && n <= DRIVE_PHOTO_LIMIT_MAX) settings.drivePhotoLimit = n;
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
  return getSettings();
}

/** Whether a photo from someone with this role goes to the AI check. Admins and super admins never do. */
export async function photoNeedsCheck(role: string | undefined): Promise<boolean> {
  if (isAdminRole(role)) return false;
  const settings = await getSettings();
  return role === 'TEAM_MEMBER' ? settings.verifyTeamPhotos : settings.verifyUserPhotos;
}
