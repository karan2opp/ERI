import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface UploadResult {
  url: string;
  publicId: string;
}

export class CloudinaryService {
  static async uploadImage(file: Express.Multer.File, folder: string = 'plantree'): Promise<UploadResult> {
    if (!file) {
      throw new Error('No file provided for upload');
    }

    const isConfigured = Boolean(
      env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
    );

    if (!isConfigured) {
      console.warn('⚠️ Cloudinary keys missing in .env. Using fallback Unsplash nature image standard.');
      const natureImages = [
        'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=80',
        'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=1000&q=80'
      ];
      const randomUrl = natureImages[Math.floor(Math.random() * natureImages.length)];
      return {
        url: randomUrl,
        publicId: `mock_public_${Date.now()}`
      };
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }]
        },
        (error, result) => {
          if (error || !result) {
            return reject(new Error(`Cloudinary upload failed: ${error?.message || 'Unknown error'}`));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      );

      uploadStream.end(file.buffer);
    });
  }

  static async deleteImage(publicId?: string): Promise<void> {
    if (!publicId || publicId.startsWith('mock_public_')) return;

    try {
      if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (error) {
      console.error(`Failed to delete Cloudinary image (${publicId}):`, error);
    }
  }
}
