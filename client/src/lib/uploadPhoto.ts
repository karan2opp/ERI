import { api } from '../services/api';

/**
 * Photos go from the phone straight to Cloudinary; they never pass through our server. The steps:
 *  1. Ask our server for a signed permission per photo (it says where the photo goes and what it may be).
 *  2. Send the photo to Cloudinary with that permission.
 *  3. Cloudinary replies with the photo's id, version and a signature. That reply is what the app sends to our
 *     server when it saves the tree, care entry, drive picture or place, so the server can check it is genuine.
 */

export type UploadKind = 'TREE' | 'CARE' | 'DRIVE' | 'PLACE';

/** Cloudinary's signed reply for one uploaded photo (what the server needs to attach it). */
export interface UploadedPhoto {
  publicId: string;
  version: number;
  signature: string;
}

interface Ticket {
  publicId: string;
  uploadUrl: string;
  apiKey: string;
  params: Record<string, string | number>;
}

/** Why a photo could not be sent, in words for the person. */
export class PhotoUploadError extends Error {}

const errorOf = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

const UPLOAD_TIMEOUT_MS = 90_000;

/** Sends one file to Cloudinary with a ticket. */
function sendToCloudinary(ticket: Ticket, file: File, onProgress?: (fraction: number) => void): Promise<UploadedPhoto> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(ticket.params)) form.append(key, String(value));
    form.append('api_key', ticket.apiKey);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', ticket.uploadUrl);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: { public_id?: string; version?: number; signature?: string; error?: { message?: string } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // handled below
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.public_id === ticket.publicId && body.version && body.signature) {
        resolve({ publicId: body.public_id, version: body.version, signature: body.signature });
      } else {
        reject(new PhotoUploadError(body.error?.message ? `The photo could not be uploaded: ${body.error.message}` : "The photo couldn't be uploaded. Try again."));
      }
    };
    xhr.onerror = () => reject(new PhotoUploadError("The photo couldn't be uploaded. Check your connection and try again."));
    xhr.ontimeout = () => reject(new PhotoUploadError('The photo took too long to upload. Check your connection and try again.'));
    xhr.send(form);
  });
}

/**
 * Uploads photos straight to Cloudinary, up to 3 at a time, and returns each one's signed reply in the same order.
 * A photo that fails for a network reason is tried once more. `onProgress` reports how many are done.
 */
export async function uploadPhotos(kind: UploadKind, files: File[], onProgress?: (done: number, total: number) => void): Promise<UploadedPhoto[]> {
  if (files.length === 0) return [];
  let tickets: Ticket[];
  try {
    tickets = (await api.post('/uploads/signature', { kind, count: files.length })).data.data;
  } catch (err) {
    throw new PhotoUploadError(errorOf(err, "Couldn't get ready to upload the photo. Check your connection and try again."));
  }

  const results: UploadedPhoto[] = new Array(files.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      try {
        results[i] = await sendToCloudinary(tickets[i], files[i]);
      } catch (first) {
        // One more try for a flaky connection; a refusal from Cloudinary will fail again the same way
        results[i] = await sendToCloudinary(tickets[i], files[i]).catch(() => {
          throw first;
        });
      }
      onProgress?.(++done, files.length);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
  } catch (err) {
    // Photos that did go up but won't be used are thrown away (anything missed is cleaned up daily)
    for (const r of results) if (r) void discardPhoto(r.publicId);
    throw err;
  }
  return results;
}

/** Throws away a photo that was uploaded but won't be used (a retake, a removed picture). Never fails. */
export async function discardPhoto(publicId: string): Promise<void> {
  try {
    await api.post('/uploads/discard', { publicId });
  } catch {
    // The daily clean-up on the server removes it
  }
}
