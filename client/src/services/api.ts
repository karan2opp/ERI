import axios from 'axios';
import type { Tree, CareLog, User } from '../types';

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

export const fetchCareHistory = async (treeId: string): Promise<CareLog[]> => {
  const res = await api.get(`/trees/${treeId}/care`);
  return res.data.data;
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

export const fetchAdminTrees = async (page: number = 1, limit: number = 10, search: string = '') => {
  const res = await api.get(`/admin/trees?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
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

