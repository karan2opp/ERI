import type { Role } from '../types';

export const ROLE_LABEL: Record<Role, string> = {
  USER: 'User',
  TEAM_MEMBER: 'Team member',
  ADMIN: 'Admin',
};

/** Team members and admins can see team-only drives (admins see every drive). Everyone else sees only drives for everyone. */
export const canSeeTeamDrives = (role: Role) => role === 'TEAM_MEMBER' || role === 'ADMIN';

/** Anything the server sends that isn't a known role is treated as a normal user. */
export const asRole = (value: unknown): Role => (value === 'ADMIN' || value === 'TEAM_MEMBER' ? value : 'USER');
