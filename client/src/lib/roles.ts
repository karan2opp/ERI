import type { Role } from '../types';

export const ROLE_LABEL: Record<Role, string> = {
  USER: 'User',
  TEAM_MEMBER: 'Team member',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super admin',
};

/** Admins and super admins: the Admin area, settings and every drive. */
export const isAdminRole = (role: Role) => role === 'ADMIN' || role === 'SUPER_ADMIN';

/** Team members and admins can see team-only drives (admins see every drive). Everyone else sees only drives for everyone. */
export const canSeeTeamDrives = (role: Role) => role === 'TEAM_MEMBER' || isAdminRole(role);

/** Anything the server sends that isn't a known role is treated as a normal user. */
export const asRole = (value: unknown): Role => (value === 'SUPER_ADMIN' || value === 'ADMIN' || value === 'TEAM_MEMBER' ? value : 'USER');
