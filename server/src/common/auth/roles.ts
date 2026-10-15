// The three roles, stored in users.role. The server checks them on every request;
// the app only uses them to decide what to show.
export const ROLES = ['USER', 'TEAM_MEMBER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Team members and admins can see the planting drive schedule. */
export const canSeeDrives = (role: string | undefined) => role === 'TEAM_MEMBER' || role === 'ADMIN';
