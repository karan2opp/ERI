/** USER can use the map; TEAM_MEMBER also sees team-only drives; ADMIN manages everything and sees all drives; SUPER_ADMIN can also make admins. */
export type Role = 'USER' | 'TEAM_MEMBER' | 'ADMIN' | 'SUPER_ADMIN';

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

/** A kind of tree that people choose from when planting; admins manage them. */
export interface TreeCategory {
  id: string;
  name: string;
  description?: string | null;
  /** Verified trees in it (the list endpoint includes this) */
  treeCount?: number;
}

export interface Tree {
  id: string;
  name: string;
  /** The kind of tree, by name (its category's name) */
  species: string;
  /** Its category; empty for trees planted before categories existed */
  categoryId?: string | null;
  description?: string;
  photoUrl: string;
  photoPublicId?: string;
  latitude: number;
  longitude: number;
  address?: string;
  healthScore: number;
  /** An old tree: planted before the app and marked on the map later, so it doesn't add to the planted count */
  isOld?: boolean;
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
  /** VERIFIED trees are on the map; PENDING ones wait for an admin to check the photo (only their owner and admins can see them) */
  verificationStatus?: 'VERIFIED' | 'PENDING';
  /** Why it is pending (admins) */
  verificationNote?: string | null;
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

/** A tree plantation drive or a clean-up drive. */
export type DriveType = 'PLANTATION' | 'CLEANUP';

/** Who can see a drive: everyone (even signed-out visitors), or team members and admins only. */
export type DriveVisibility = 'ALL' | 'TEAM';

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
  type: DriveType;
  visibility: DriveVisibility;
  /** COMPLETED once an admin has wrapped it up: its summary and pictures are then shown to everyone who can see the drive */
  status?: 'SCHEDULED' | 'COMPLETED';
  /** How the drive went. Admins also see a draft before the drive is completed. */
  summary?: string | null;
  /** Kilograms of waste collected, for a completed clean-up drive */
  wasteKg?: number | null;
  completedAt?: string | null;
  createdAt?: string;
}

/** A picture an admin added to a drive */
export interface DrivePhoto {
  id: string;
  url: string;
  createdAt: string;
}
