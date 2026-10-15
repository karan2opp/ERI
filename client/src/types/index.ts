/** USER can use the map; TEAM_MEMBER also sees the planting drive schedule; ADMIN manages everything. */
export type Role = 'USER' | 'TEAM_MEMBER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: Role;
  /** Optional, not verified. Only the person and admins can see it. */
  phone?: string | null;
  avatarUrl?: string;
}

export interface CareLog {
  id: string;
  treeId: string;
  actionType: 'WATERED' | 'FERTILIZED' | 'PRUNED' | 'INSPECTED' | 'WEEDED';
  notes?: string;
  photoUrl?: string;
  photoPublicId?: string;
  userId: string;
  performer?: User;
  performedAt: string;
}

export interface Tree {
  id: string;
  name: string;
  species: string;
  description?: string;
  photoUrl: string;
  photoPublicId?: string;
  latitude: number;
  longitude: number;
  address?: string;
  healthScore: number;
  /** When it was planted (its "birth date"); can be earlier than when it was added to the map */
  plantedAt: string;
  lastWateredAt?: string | null;
  /** Last care of any kind */
  lastCaredAt?: string | null;
  lastFertilizedAt?: string | null;
  /** Last time the grass around it was removed */
  lastWeededAt?: string | null;
  /** Care schedule: days between each task */
  waterEveryDays: number;
  fertilizeEveryDays: number;
  weedEveryDays: number;
  /** Admin lists include the owner's name */
  ownerName?: string | null;
  userId: string;
  owner?: User;
  careLogs?: CareLog[];
  createdAt: string;
  updatedAt: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Drive {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  googleMapsUrl?: string | null;
  createdAt?: string;
}
