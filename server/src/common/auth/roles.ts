// The three roles, stored in users.role. The server checks them on every request;
// the app only uses them to decide what to show.
export const ROLES = ['USER', 'TEAM_MEMBER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Team members and admins can see team-only drives (admins see every drive). */
export const canSeeTeamDrives = (role: string | undefined) => role === 'TEAM_MEMBER' || role === 'ADMIN';

/** What kind of drive it is. */
export const DRIVE_TYPES = ['PLANTATION', 'CLEANUP'] as const;
export type DriveType = (typeof DRIVE_TYPES)[number];

/** Who can see a drive: everyone, or team members and admins only. Admins always see all drives. */
export const DRIVE_VISIBILITIES = ['ALL', 'TEAM'] as const;
export type DriveVisibility = (typeof DRIVE_VISIBILITIES)[number];
