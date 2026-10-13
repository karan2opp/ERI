import axios from 'axios';
import type { Tree, CareLog, User, Drive } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

type TokenGetter = () => Promise<string | null>;

let getAuthToken: TokenGetter | null = null;

// Identity is proven only by the Clerk session token; the server never trusts client-supplied user headers.
export const setAuthTokenGetter = (getter: TokenGetter | null) => {
  getAuthToken = getter;
};

export const getAuthTokenValue = async (): Promise<string | null> => {
  if (!getAuthToken) return null;
  try {
    return await getAuthToken();
  } catch (err) {
    console.warn('Failed to get Clerk token:', err);
    return null;
  }
};

api.interceptors.request.use(async (config) => {
  const token = await getAuthTokenValue();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const syncCurrentUser = async (): Promise<User> => {
  const res = await api.post('/users/sync');
  return res.data.data;
};

export const fetchAllTrees = async (): Promise<Tree[]> => {
  const res = await api.get('/trees');
  return res.data.data;
};

export const fetchTreeById = async (id: string): Promise<Tree> => {
  const res = await api.get(`/trees/${id}`);
  return res.data.data;
};

export const createTree = async (formData: FormData): Promise<Tree> => {
  const res = await api.post('/trees', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
};

export const updateTree = async (id: string, formData: FormData): Promise<Tree> => {
  const res = await api.put(`/trees/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
};

export const deleteTree = async (id: string): Promise<void> => {
  await api.delete(`/trees/${id}`);
};

export const logCareActivity = async (treeId: string, formData: FormData): Promise<CareLog> => {
  const res = await api.post(`/trees/${treeId}/care`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
};

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

/** One page of a tree's care history, newest first. */
export const fetchCareHistory = async (treeId: string, page = 1, limit = 10): Promise<Paged<CareLog>> => {
  const res = await api.get(`/trees/${treeId}/care`, { params: { page, limit } });
  return res.data;
};

export type TreeStatusFilter = 'all' | 'thirsty' | 'healthy';
export type TreeSort = 'nearest' | 'newest' | 'oldest' | 'thirsty';

/**
 * One page of trees from the server: nearest first when `near` is given (each with `distance` in
 * metres), filtered by status, radius, search and (signed in) your own trees. With `mine`, also
 * returns `summary` counts for your trees.
 */
export const browseTrees = async (params: {
  page: number;
  limit?: number;
  near?: { lat: number; lng: number } | null;
  radius?: number | null;
  status?: TreeStatusFilter;
  mine?: boolean;
  search?: string;
  sort?: TreeSort;
}): Promise<Paged<Tree & { distance?: number }> & { summary?: { total: number; thirsty: number } }> => {
  const res = await api.get('/trees/browse', {
    params: {
      page: params.page,
      limit: params.limit ?? 10,
      ...(params.near ? { lat: params.near.lat, lng: params.near.lng } : {}),
      ...(params.near && params.radius ? { radius: params.radius } : {}),
      status: params.status ?? 'all',
      ...(params.mine ? { mine: 'true' } : {}),
      ...(params.search ? { search: params.search } : {}),
      ...(params.sort ? { sort: params.sort } : {}),
    },
  });
  return res.data;
};

// Admin APIs
export const fetchAdminStats = async () => {
  const res = await api.get('/admin/stats');
  return res.data;
};

export const fetchAdminUsers = async (page: number = 1, limit: number = 10, search: string = '') => {
  const res = await api.get(`/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
  return res.data;
};

export type TreeDateField = 'planted' | 'watered' | 'cared';

/**
 * Admin tree search: name/kind/address text, a date range (from the start of `from` to the end of
 * `to`, in the admin's own time zone) on when trees were planted, last watered or last cared for,
 * and needs-water/healthy.
 */
export const fetchAdminTrees = async (params: {
  page: number;
  limit?: number;
  search?: string;
  dateField?: TreeDateField;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  status?: 'all' | 'thirsty' | 'healthy';
}): Promise<{ data: Tree[]; total: number; page: number; totalPages: number }> => {
  const startOf = (day: string) => new Date(`${day}T00:00`).toISOString();
  const endOf = (day: string) => {
    const d = new Date(`${day}T00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  };
  const res = await api.get('/admin/trees', {
    params: {
      page: params.page,
      limit: params.limit ?? 10,
      ...(params.search ? { search: params.search } : {}),
      dateField: params.dateField ?? 'planted',
      ...(params.from ? { from: startOf(params.from) } : {}),
      ...(params.to ? { to: endOf(params.to) } : {}),
      status: params.status ?? 'all',
    },
  });
  return res.data;
};

// Global Drives APIs
export const fetchGlobalDrives = async () => {
  const res = await api.get(`/drives`);
  return res.data;
};

export const getDriveById = async (id: string) => {
  const res = await api.get(`/drives/${id}`);
  return res.data;
};

export const createGlobalDrive = async (data: { title: string, description: string, date: string, time: string, latitude?: number, longitude?: number, address: string, googleMapsUrl?: string }) => {
  const res = await api.post(`/drives`, data);
  return res.data;
};

// Maps & Geocoding APIs (Proxied through backend using Google Maps)
export const searchPlacesApi = async (query: string) => {
  const res = await api.get(`/maps/places?q=${encodeURIComponent(query)}`);
  return res.data;
};

export const reverseGeocodeApi = async (lat: number, lng: number) => {
  const res = await api.get(`/maps/reverse-geocode?lat=${lat}&lng=${lng}`);
  return res.data;
};

export const geocodeAddressApi = async (query: string) => {
  const res = await api.get(`/maps/geocode?q=${encodeURIComponent(query)}`);
  return res.data;
};


export interface DrivesPageResult {
  data: Drive[];
  total: number;
  page: number;
  totalPages: number;
  counts: { upcoming: number; past: number };
}

/** Local date as YYYY-MM-DD, so "upcoming" means from today where the person is. */
export const localToday = () => new Date().toLocaleDateString('en-CA');

/** One page of drives: title search, an exact date, and upcoming/past/all. */
export const fetchDrivesPage = async (params: {
  page: number;
  limit?: number;
  search?: string;
  date?: string | null;
  when: 'upcoming' | 'past' | 'all';
}): Promise<DrivesPageResult> => {
  const res = await api.get('/drives', {
    params: {
      page: params.page,
      limit: params.limit ?? 10,
      when: params.when,
      today: localToday(),
      ...(params.search ? { search: params.search } : {}),
      ...(params.date ? { date: params.date } : {}),
    },
  });
  return res.data;
};

/** Days in a month (YYYY-MM) that have drives, with how many. */
export const fetchDriveCalendar = async (month: string): Promise<{ date: string; count: number }[]> => {
  const res = await api.get('/drives/calendar', { params: { month } });
  return res.data.data;
};
