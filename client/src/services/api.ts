import axios from 'axios';
import type { Tree, CareLog, User, Drive, DrivePhoto, Role, DriveType, DriveVisibility, TreeCategory } from '../types';
import type { UploadedPhoto } from '../lib/uploadPhoto';

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

/**
 * Changes your name. Names are unique: the server answers 409 (NAME_TAKEN) when someone already has it.
 * It also saves the name in Clerk, so reload the Clerk user afterwards.
 */
export const setMyName = async (firstName: string, lastName: string): Promise<User> => {
  const res = await api.put('/users/me/name', { firstName, lastName });
  return res.data.data;
};

export const syncCurrentUser = async (): Promise<User> => {
  const res = await api.post('/users/sync');
  return res.data.data;
};

/** One tree on the map: just enough to draw its pin. */
export interface TreePin {
  id: string;
  lat: number;
  lng: number;
  name: string;
  /** The most urgent thing it needs (water, then fertiliser, then grass removal); null when healthy */
  needs?: 'thirsty' | 'fertilize' | 'weed' | null;
  needsWater: boolean;
}

/** Several trees close together, drawn as one bubble with a count. A cell with one tree carries its id. */
export interface PinCluster {
  lat: number;
  lng: number;
  count: number;
  /** How many of the trees show each pin: needs water, needs fertiliser, needs grass removal (a tree counts once, as its first need) */
  thirsty: number;
  fertilize?: number;
  weed?: number;
  id?: string;
  name?: string;
}

export type PinsResult = { kind: 'trees'; data: TreePin[]; empty: boolean } | { kind: 'clusters'; data: PinCluster[]; empty: boolean };

/**
 * What the map draws: pins in the visible area (`bbox` + `zoom`), or every tree within `radius` metres
 * of you. Zoomed out, or with too many trees, the server sends clusters instead.
 */
export const fetchTreePins = async (
  params: { bbox?: string; zoom: number; lat?: number; lng?: number; radius?: number; status: TreeStatusFilter; mine?: boolean; v?: number },
  signal?: AbortSignal
): Promise<PinsResult> => {
  const res = await api.get('/trees/pins', {
    params: { ...params, mine: params.mine ? 'true' : undefined, v: params.v || undefined },
    signal,
  });
  return { kind: res.data.kind, data: res.data.data, empty: Boolean(res.data.empty) } as PinsResult;
};

export const fetchTreeById = async (id: string): Promise<Tree> => {
  const res = await api.get(`/trees/${id}`);
  return res.data.data;
};

// ---- Tree categories (anyone can read them; admins change them)
/** The categories, 10 per page, A to Z. `search` matches the name. */
export const fetchCategories = async (params: { page?: number; limit?: number; search?: string } = {}): Promise<Paged<TreeCategory>> => {
  const res = await api.get('/categories', { params: { page: params.page ?? 1, limit: params.limit ?? 10, ...(params.search ? { search: params.search } : {}) } });
  return res.data;
};

export const createCategory = async (data: { name: string; description?: string }): Promise<TreeCategory> => {
  const res = await api.post('/categories', data);
  return res.data.data;
};

export const updateCategory = async (id: string, changes: { name?: string; description?: string }): Promise<TreeCategory> => {
  const res = await api.patch(`/categories/${id}`, changes);
  return res.data.data;
};

export const deleteCategory = async (id: string): Promise<{ treesKept: number }> => {
  const res = await api.delete(`/categories/${id}`);
  return res.data.data;
};

/** What the AI photo check says about a photo: a tree or plant, not one, not sure, or not checked for this person. */
export type PhotoVerdict = 'TRUE' | 'FALSE' | 'PENDING' | 'SKIPPED';

/**
 * Checks a photo right after it was uploaded to Cloudinary (planting checks again on the server, reusing this
 * answer). A photo that is rejected (FALSE) is deleted on the server at once.
 */
export const checkTreePhoto = async (photo: UploadedPhoto): Promise<PhotoVerdict> => {
  const res = await api.post('/trees/check-photo', { photo }, { timeout: 45_000 });
  return res.data.verdict;
};

/** What the server needs to plant a tree: the fields below, and the photo as Cloudinary replied after the upload. */
export interface NewTreeInput {
  name: string;
  categoryId: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  deviceLatitude: number;
  deviceLongitude: number;
  deviceAccuracy: number;
  plantedAt?: string;
  waterEveryDays: number;
  fertilizeEveryDays: number;
  weedEveryDays: number;
  photo: UploadedPhoto;
}

export const createTree = async (input: NewTreeInput): Promise<Tree> => {
  // The photo check can take a while when OpenAI is slow
  const res = await api.post('/trees', input, { timeout: 70_000 });
  return res.data.data;
};

/** Changes to a tree. `photo` is a new photo already uploaded to Cloudinary. */
export interface TreeChanges {
  name: string;
  categoryId?: string;
  address: string;
  description: string;
  healthScore: number;
  plantedAt?: string;
  waterEveryDays: number;
  fertilizeEveryDays: number;
  weedEveryDays: number;
  photo?: UploadedPhoto;
}

export const updateTree = async (id: string, changes: TreeChanges): Promise<Tree> => {
  const res = await api.put(`/trees/${id}`, changes, { timeout: 70_000 });
  return res.data.data;
};

export const deleteTree = async (id: string): Promise<void> => {
  await api.delete(`/trees/${id}`);
};

/** The tree's owner or an admin: removes the photo from a care entry (the entry stays). */
export const removeCarePhoto = async (treeId: string, logId: string): Promise<void> => {
  await api.delete(`/trees/${treeId}/care/${logId}/photo`);
};

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

/** One page of a tree's care history, newest first. */
/** Public details for the site (each is "" until an admin sets it in Settings). */
export interface SiteInfo {
  /** The Google Form for joining the team */
  joinTeamFormUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  contactEmail: string;
  /** International form, like "+919876543210" */
  contactPhone: string;
  /** The WhatsApp number donations go through, like "+919876543210" */
  donateWhatsapp: string;
}

export const fetchSiteInfo = async (): Promise<SiteInfo> => {
  const res = await api.get('/site');
  return res.data.data;
};

/** The four numbers on the public home page. */
export interface SiteStats {
  treesPlanted: number;
  plantationDrives: number;
  cleanupDrives: number;
  wasteCollectedKg: number;
}

export const fetchSiteStats = async (): Promise<SiteStats> => {
  const res = await api.get('/stats', { params: { today: new Date().toLocaleDateString('en-CA') } });
  return res.data.data;
};

export const fetchCareHistory = async (treeId: string, page = 1, limit = 10): Promise<Paged<CareLog>> => {
  const res = await api.get(`/trees/${treeId}/care`, { params: { page, limit } });
  return res.data;
};

export type TreeStatusFilter = 'all' | 'thirsty' | 'fertilize' | 'weed' | 'healthy';
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
}): Promise<Paged<Tree & { distance?: number }> & { summary?: { total: number; thirsty: number; needy?: number } }> => {
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
/** Admin: trees whose photo the automatic check wasn't sure about, oldest first. */
export const fetchPendingTrees = async (page = 1, limit = 10): Promise<Paged<Tree & { ownerEmail?: string | null }>> => {
  const res = await api.get('/admin/trees/pending', { params: { page, limit } });
  return res.data;
};

/** Admin: approve a pending tree onto the map, or reject (remove) it. */
export const reviewTree = async (id: string, decision: 'APPROVE' | 'REJECT') => {
  const res = await api.post(`/admin/trees/${id}/review`, { decision });
  return res.data;
};

export const fetchAdminStats = async () => {
  const res = await api.get('/admin/stats');
  return res.data;
};

/** Whose tree photos go to the AI photo check (admins and super admins are never checked). */
export interface AppSettings {
  verifyUserPhotos: boolean;
  verifyTeamPhotos: boolean;
  /** How many pictures one drive can have */
  drivePhotoLimit: number;
  /** The home page's starting numbers: what the NGO had done before the app (the page adds what the app counts) */
  baselineTrees: number;
  baselinePlantationDrives: number;
  baselineCleanupDrives: number;
  baselineWasteKg: number;
  /** The Google Form for joining the team ("" means no button on the home page) */
  joinTeamFormUrl: string;
  /** Footer and Donate page details ("" until set) */
  instagramUrl: string;
  youtubeUrl: string;
  contactEmail: string;
  contactPhone: string;
  donateWhatsapp: string;
}

export const fetchAppSettings = async (): Promise<AppSettings> => {
  const res = await api.get('/admin/settings');
  return res.data.data;
};

export const updateAppSettings = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
  const res = await api.patch('/admin/settings', patch);
  return res.data.data;
};

/** Admin: change someone's role. Making an admin or super admin, or changing one, needs a super admin. */
export const setUserRole = async (userId: string, role: Role): Promise<User> => {
  const res = await api.patch(`/admin/users/${userId}/role`, { role });
  return res.data.data;
};

/** Save or remove (empty) your own phone number. It isn't verified. */
export const updateMyPhone = async (phone: string): Promise<User> => {
  const res = await api.put('/users/me/phone', { phone: phone.trim() || null });
  return res.data.data;
};

export interface AdminUserProfile {
  user: User & { createdAt: string; updatedAt: string };
  stats: {
    treesPlanted: number;
    careTotal: number;
    careByType: Record<string, number>;
    lastActiveAt: string | null;
  };
}

/** Admin: one user's details and a summary of what they've done. */
export const fetchAdminUser = async (userId: string): Promise<AdminUserProfile> => {
  const res = await api.get(`/admin/users/${encodeURIComponent(userId)}`);
  return res.data.data;
};

export type AdminCareEntry = CareLog & { treeName: string; treeId: string };

/** Admin: a user's care actions, newest first, 10 at a time. */
export const fetchAdminUserCare = async (userId: string, page = 1, limit = 10): Promise<Paged<AdminCareEntry>> => {
  const res = await api.get(`/admin/users/${encodeURIComponent(userId)}/care`, { params: { page, limit } });
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
 * and what they need (water, fertiliser, grass removal) or healthy.
 */
export const fetchAdminTrees = async (params: {
  page: number;
  limit?: number;
  search?: string;
  dateField?: TreeDateField;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  status?: TreeStatusFilter;
  /** Only trees planted by this user */
  userId?: string;
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
      ...(params.userId ? { userId: params.userId } : {}),
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

/** Who is told about a drive by email and push notification. */
export type NotifyAudience = 'NONE' | 'TEAM' | 'EVERYONE';

/** How many people the server is telling about a drive change (it sends in the background). */
export interface Notifying {
  audience: NotifyAudience;
  emails: number;
  devices: number;
}

export interface DriveFields {
  title: string;
  description: string;
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  address: string;
  googleMapsUrl: string;
  type: DriveType;
  visibility: DriveVisibility;
}

export const createGlobalDrive = async (data: Omit<DriveFields, 'googleMapsUrl'> & { googleMapsUrl?: string; notify: NotifyAudience }): Promise<{ data: Drive; notifying?: Notifying }> => {
  const res = await api.post(`/drives`, data);
  return res.data;
};

/** Admin: change anything about a drive. `notify` tells people about the change. */
export const updateDrive = async (id: string, changes: Partial<DriveFields> & { summary?: string; wasteKg?: number | null; notify?: NotifyAudience }): Promise<{ drive: Drive; notifying?: Notifying }> => {
  const res = await api.patch(`/drives/${id}`, changes);
  return { drive: res.data.data, notifying: res.data.notifying };
};

/** Admin: delete a drive, and optionally tell people it is cancelled. */
export const deleteDrive = async (id: string, notify: NotifyAudience = 'NONE'): Promise<Notifying | undefined> => {
  const res = await api.delete(`/drives/${id}`, { params: { notify } });
  return res.data.notifying;
};

// ---- Wrapping a drive up: pictures, and marking it completed

export interface DrivePhotosPage {
  data: DrivePhoto[];
  total: number;
  page: number;
  totalPages: number;
}

/** One page (10 by default) of a drive's pictures. Visitors only get them once the drive is completed. */
export const fetchDrivePhotos = async (driveId: string, page: number, limit = 10): Promise<DrivePhotosPage> => {
  const res = await api.get(`/drives/${driveId}/photos`, { params: { page, limit } });
  return res.data;
};

/** Admin: adds one picture (the server refuses past the limit set in Settings). */
export const removeDrivePhoto = async (driveId: string, photoId: string): Promise<void> => {
  await api.delete(`/drives/${driveId}/photos/${photoId}`);
};

/**
 * Admin: marks the drive completed (it needs a summary, sent now or saved before). For a clean-up drive,
 * `wasteKg` is the waste collected, added to the home page's total.
 */
export const completeDrive = async (driveId: string, summary: string, wasteKg?: number): Promise<Drive> => {
  const res = await api.post(`/drives/${driveId}/complete`, { summary, ...(wasteKg !== undefined ? { wasteKg } : {}) });
  return res.data.data;
};

/** Admin: undoes "completed". */
export const reopenDrive = async (driveId: string): Promise<Drive> => {
  const res = await api.post(`/drives/${driveId}/reopen`);
  return res.data.data;
};

// ---- Notifications (email and push)
export const fetchNotificationConfig = async (): Promise<{ push: boolean; publicKey: string | null; email: boolean }> => {
  const res = await api.get('/notifications/config');
  return res.data.data;
};

export const fetchNotificationPreferences = async (): Promise<{ emailDrives: boolean; pushDevices: number }> => {
  const res = await api.get('/notifications/preferences');
  return res.data.data;
};

export const setEmailDrives = async (emailDrives: boolean) => {
  await api.put('/notifications/preferences', { emailDrives });
};

/** Emails a 6-digit code to the signed-in person, so they can choose a new password without the old one. */
export const requestPasswordReset = async () => {
  await api.post('/users/me/password-reset');
};

/** Checks the emailed code and sets the new password. */
export const confirmPasswordReset = async (code: string, newPassword: string) => {
  await api.post('/users/me/password-reset/confirm', { code, newPassword });
};

// ---- The bell (in-app notifications)

export type InboxType = 'DRIVE_SCHEDULED' | 'USER_JOINED' | 'TREE_PLANTED' | 'PLACE_SUGGESTED';

/** One notification in your bell. `link` is where tapping it goes, inside the site. */
export interface InboxItem {
  id: string;
  type: InboxType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface InboxPage {
  data: InboxItem[];
  total: number;
  unread: number;
  page: number;
  totalPages: number;
}

/** Your notifications, newest first, 10 a page. */
export const fetchInbox = async (page: number): Promise<InboxPage> => {
  const res = await api.get('/notifications/inbox', { params: { page, limit: 10 } });
  return res.data;
};

export const fetchUnreadCount = async (): Promise<number> => {
  const res = await api.get('/notifications/inbox/unread-count');
  return res.data.data.unread;
};

/** Marks one as read; answers with how many are still unread. */
export const markNotificationRead = async (id: string): Promise<number> => {
  const res = await api.post(`/notifications/inbox/${id}/read`);
  return res.data.unread;
};

export const markAllNotificationsRead = async (): Promise<void> => {
  await api.post('/notifications/inbox/read-all');
};

export const subscribePush = async (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) => {
  await api.post('/notifications/push/subscribe', subscription);
};

export const unsubscribePush = async (endpoint: string) => {
  await api.post('/notifications/push/unsubscribe', { endpoint });
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
  /** Only this kind of drive */
  type?: DriveType | null;
  /** Only drives with this visibility (team members and admins; everyone else only ever sees drives for everyone) */
  visibility?: DriveVisibility | null;
}): Promise<DrivesPageResult> => {
  const res = await api.get('/drives', {
    params: {
      page: params.page,
      limit: params.limit ?? 10,
      when: params.when,
      today: localToday(),
      ...(params.search ? { search: params.search } : {}),
      ...(params.date ? { date: params.date } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.visibility ? { visibility: params.visibility } : {}),
    },
  });
  return res.data;
};

/** Days in a month (YYYY-MM) that have drives, with how many. */
export const fetchDriveCalendar = async (month: string): Promise<{ date: string; count: number }[]> => {
  const res = await api.get('/drives/calendar', { params: { month } });
  return res.data.data;
};

// ---- Place forms (people suggest where to plant trees or clean up)

/** What a form's places are for; EITHER lets each person choose. */
export type PlaceFormKind = 'PLANTATION' | 'CLEANUP' | 'EITHER';
export type PlaceKind = Exclude<PlaceFormKind, 'EITHER'>;

export interface PlaceForm {
  id: string;
  title: string;
  description: string | null;
  kind: PlaceFormKind;
  status: 'OPEN' | 'CLOSED';
  /** Up to two extra questions; every one has to be answered */
  questions: string[];
  createdAt: string;
  updatedAt: string;
  /** Admins only: how many places came in */
  suggestionCount?: number;
}

export interface PlaceFormFields {
  title: string;
  description: string;
  kind: PlaceFormKind;
  questions: string[];
  status: 'OPEN' | 'CLOSED';
}

/** One place someone sent (admins only). */
export interface PlaceSuggestion {
  id: string;
  kind: PlaceKind;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
  landmark: string;
  answers: { question: string; answer: string }[];
  photos: string[];
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  userAvatarUrl: string | null;
}

/** The forms, open ones first, a page at a time. */
export const fetchPlaceForms = async (page: number, limit = 10, status: 'ALL' | 'OPEN' | 'CLOSED' = 'ALL'): Promise<Paged<PlaceForm>> => {
  const res = await api.get('/place-forms', { params: { page, limit, status } });
  return res.data;
};

export const fetchPlaceForm = async (id: string): Promise<PlaceForm> => {
  const res = await api.get(`/place-forms/${id}`);
  return res.data.data;
};

export const createPlaceForm = async (fields: PlaceFormFields): Promise<PlaceForm> => {
  const res = await api.post('/place-forms', fields);
  return res.data.data;
};

export const updatePlaceForm = async (id: string, changes: Partial<PlaceFormFields>): Promise<PlaceForm> => {
  const res = await api.patch(`/place-forms/${id}`, changes);
  return res.data.data;
};

export const deletePlaceForm = async (id: string): Promise<void> => {
  await api.delete(`/place-forms/${id}`);
};

/** Sends a place: the pin and/or a Google Maps link, a landmark, the answers and up to 5 pictures. */
export const sendPlaceSuggestion = async (
  formId: string,
  place: { kind?: PlaceKind; pin: LatLngLike | null; googleMapsUrl: string; landmark: string; answers: string[]; photos: UploadedPhoto[] }
): Promise<void> => {
  await api.post(
    `/place-forms/${formId}/suggestions`,
    {
      kind: place.kind,
      latitude: place.pin?.lat,
      longitude: place.pin?.lng,
      googleMapsUrl: place.googleMapsUrl || undefined,
      landmark: place.landmark,
      answers: place.answers,
      photos: place.photos,
    },
    { timeout: 60_000 }
  );
};
type LatLngLike = { lat: number; lng: number };

export const fetchPlaceSuggestions = async (formId: string, page: number, limit = 10): Promise<Paged<PlaceSuggestion>> => {
  const res = await api.get(`/place-forms/${formId}/suggestions`, { params: { page, limit } });
  return res.data;
};

export const deletePlaceSuggestion = async (formId: string, suggestionId: string): Promise<void> => {
  await api.delete(`/place-forms/${formId}/suggestions/${suggestionId}`);
};
