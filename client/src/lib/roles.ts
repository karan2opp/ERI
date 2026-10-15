import type { Role } from '../types';

export const ROLE_LABEL: Record<Role, string> = {
  USER: 'User',
  TEAM_MEMBER: 'Team member',
  ADMIN: 'Admin',
};

/** Team members and admins can see the planting drive schedule; normal users can't. */
export const canSeeDrives = (role: Role) => role === 'TEAM_MEMBER' || role === 'ADMIN';

/** Anything the server sends that isn't a known role is treated as a normal user. */
export const asRole = (value: unknown): Role => (value === 'ADMIN' || value === 'TEAM_MEMBER' ? value : 'USER');
