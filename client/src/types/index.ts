export interface User {
  id: string;
  email: string;
  name?: string;
  role?: 'USER' | 'ADMIN';
  avatarUrl?: string;
}

export interface CareLog {
  id: string;
  treeId: string;
  actionType: 'WATERED' | 'FERTILIZED' | 'PRUNED' | 'INSPECTED';
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
