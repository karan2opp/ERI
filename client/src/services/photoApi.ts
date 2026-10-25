import type { CareLog, DrivePhoto } from '../types';
import { api } from './api';
import { discardPhoto, uploadPhotos, type UploadedPhoto } from '../lib/uploadPhoto';
import { shrinkImage } from '../lib/shrinkImage';

// Calls that save a photo. Each one sends the photo straight to Cloudinary first (never through our server), then
// tells our server about it with a small JSON request. If saving fails, the uploaded photo is thrown away.

/** Uploads one file, then runs `save` with its reply. A photo that could not be saved is discarded. */
async function withUpload<T>(kind: 'CARE' | 'DRIVE', file: File, save: (photo: UploadedPhoto) => Promise<T>): Promise<T> {
  const [photo] = await uploadPhotos(kind, [await shrinkImage(file)]);
  try {
    return await save(photo);
  } catch (err) {
    void discardPhoto(photo.publicId);
    throw err;
  }
}

/** Logs care on a tree, optionally with a photo taken just now. */
export const logCareActivity = async (treeId: string, input: { actionType: string; notes?: string; photo?: File }): Promise<CareLog> => {
  const send = async (photo?: UploadedPhoto) =>
    (await api.post(`/trees/${treeId}/care`, { actionType: input.actionType, notes: input.notes, photo }, { timeout: 60_000 })).data.data as CareLog;
  return input.photo ? withUpload('CARE', input.photo, send) : send();
};

/** The tree's owner or an admin: swaps the photo of a care entry for a new one. */
export const replaceCarePhoto = (treeId: string, logId: string, photo: File): Promise<CareLog> =>
  withUpload('CARE', photo, async (uploaded) => (await api.put(`/trees/${treeId}/care/${logId}/photo`, { photo: uploaded }, { timeout: 60_000 })).data.data as CareLog);

/** Admin: adds a picture to a drive. */
export const addDrivePhoto = (driveId: string, file: File): Promise<DrivePhoto> =>
  withUpload('DRIVE', file, async (uploaded) => (await api.post(`/drives/${driveId}/photos`, { photo: uploaded }, { timeout: 60_000 })).data.data as DrivePhoto);

/** Admin: swaps one picture of a drive for another, keeping its place. */
export const replaceDrivePhoto = (driveId: string, photoId: string, file: File): Promise<DrivePhoto> =>
  withUpload('DRIVE', file, async (uploaded) => (await api.put(`/drives/${driveId}/photos/${photoId}`, { photo: uploaded }, { timeout: 60_000 })).data.data as DrivePhoto);
