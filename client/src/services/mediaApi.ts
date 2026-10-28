import { api, type Paged } from './api';
import type { UploadedPhoto } from '../lib/uploadPhoto';

/** One photo or video on the Media page. `thumbUrl` is a small still picture of it (a video's first frame). */
export interface MediaItem {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  caption: string;
  createdAt: string;
  url: string;
  thumbUrl: string;
}

export type MediaFilter = 'all' | 'image' | 'video';

export type MediaPage = Paged<MediaItem> & { counts: { images: number; videos: number } };

/** The Media page's photos and videos, newest first, 10 at a time (the server pages them). */
export const fetchMedia = async (params: { type?: MediaFilter; page: number; limit?: number; v?: number }): Promise<MediaPage> => {
  const res = await api.get('/media', { params: { type: params.type ?? 'all', page: params.page, limit: params.limit ?? 10, v: params.v || undefined } });
  return res.data;
};

/** Admins: add photos and videos that were already uploaded straight to Cloudinary. All are added or none. */
export const addMedia = async (items: { type: 'IMAGE' | 'VIDEO'; file: UploadedPhoto; caption?: string }[]): Promise<MediaItem[]> => {
  const res = await api.post('/media', { items }, { timeout: 30_000 });
  return res.data.data;
};

export const updateMediaCaption = async (id: string, caption: string): Promise<MediaItem> => {
  const res = await api.patch(`/media/${id}`, { caption });
  return res.data.data;
};

export const deleteMedia = async (id: string): Promise<void> => {
  await api.delete(`/media/${id}`);
};
