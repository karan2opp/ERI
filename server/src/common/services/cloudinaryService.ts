import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

const configured = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

if (configured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// What Cloudinary does to every photo as it receives it (the same limits the server used to apply): nothing
// bigger than 1200 x 1200, with automatic quality. These are part of the signature, so the browser cannot change them.
const INCOMING_TRANSFORMATION = 'c_limit,h_1200,q_auto,w_1200';
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp';

/** Everything the browser needs to send one photo straight to Cloudinary. */
export interface SignedUpload {
  uploadUrl: string;
  apiKey: string;
  /** Form fields to send with the file, exactly as given (they are covered by the signature) */
  params: Record<string, string | number>;
}

/**
 * Photos never pass through this server. The server only signs a short-lived permission for one upload
 * (which says where the photo goes and what it may be), the browser uploads it to Cloudinary, and the server
 * later checks Cloudinary's signed reply before attaching the photo to anything.
 */
export class CloudinaryService {
  static isConfigured(): boolean {
    return configured;
  }

  /** A signed permission to upload one photo as `publicId`. The signature is valid for about an hour. */
  static signUpload(publicId: string): SignedUpload {
    const toSign = {
      allowed_formats: ALLOWED_FORMATS,
      public_id: publicId,
      timestamp: Math.round(Date.now() / 1000),
      transformation: INCOMING_TRANSFORMATION,
    };
    const signature = cloudinary.utils.api_sign_request(toSign, env.CLOUDINARY_API_SECRET!);
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      apiKey: env.CLOUDINARY_API_KEY!,
      params: { ...toSign, signature },
    };
  }

  /**
   * Whether Cloudinary really stored this photo: its reply to an upload carries a signature made with our
   * secret over the photo's id and version, which nobody else can forge.
   */
  static isGenuineUpload(publicId: string, version: number, signature: string): boolean {
    if (!configured) return false;
    // The helper exists in the SDK but is missing from its type definitions
    const utils = cloudinary.utils as unknown as { verify_api_response_signature(publicId: string, version: number, signature: string): boolean };
    return utils.verify_api_response_signature(publicId, version, signature);
  }

  /** The address of a stored photo (the version makes it point at exactly the photo that was uploaded). */
  static urlFor(publicId: string, version: number): string {
    // `analytics: false` keeps the SDK's tracking tag (?_a=...) out of the saved address
    return cloudinary.url(publicId, { secure: true, version, resource_type: 'image', type: 'upload', analytics: false } as Record<string, unknown>);
  }

  /** Removes a photo. True when it is gone (including "it was never there"), false when Cloudinary couldn't be reached. */
  static async destroy(publicId: string): Promise<boolean> {
    if (!configured) return false;
    try {
      const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
      return result?.result === 'ok' || result?.result === 'not found';
    } catch (error) {
      console.error(`Failed to delete Cloudinary image (${publicId}):`, error);
      return false;
    }
  }

  /** Removes a photo and never fails the caller. Photos from before the move to direct uploads can have placeholder ids. */
  static async deleteImage(publicId?: string | null): Promise<void> {
    if (!publicId || publicId.startsWith('mock_public_')) return;
    await CloudinaryService.destroy(publicId);
  }
}
