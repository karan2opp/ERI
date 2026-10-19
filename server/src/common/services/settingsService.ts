import { eq } from 'drizzle-orm';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { isAdminRole } from '../auth/roles';

/** App-wide switches that admins can change in Admin > Settings. */
export interface AppSettings {
  /** Send normal users' tree photos to the AI photo check */
  verifyUserPhotos: boolean;
  /** Send team members' tree photos to the AI photo check */
  verifyTeamPhotos: boolean;
}

export const SETTING_KEYS = ['verifyUserPhotos', 'verifyTeamPhotos'] as const;

// Normal users are checked; team members are trusted. Admins and super admins are never checked.
const DEFAULTS: AppSettings = { verifyUserPhotos: true, verifyTeamPhotos: false };

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(appSettings);
  const settings = { ...DEFAULTS };
  for (const row of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) settings[row.key as keyof AppSettings] = row.value === 'true';
  }
  return settings;
}

export async function updateSettings(patch: Partial<AppSettings>, userId: string): Promise<AppSettings> {
  for (const key of SETTING_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    await db
      .insert(appSettings)
      .values({ key, value: String(value), updatedBy: userId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: String(value), updatedBy: userId, updatedAt: new Date() } });
  }
  return getSettings();
}

/** Whether a photo from someone with this role goes to the AI check. Admins and super admins never do. */
export async function photoNeedsCheck(role: string | undefined): Promise<boolean> {
  if (isAdminRole(role)) return false;
  const settings = await getSettings();
  return role === 'TEAM_MEMBER' ? settings.verifyTeamPhotos : settings.verifyUserPhotos;
}
