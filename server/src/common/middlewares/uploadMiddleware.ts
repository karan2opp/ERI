import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const images = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WEBP) are allowed!'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});
const upload = images.single('photo');

// The mimetype is client-supplied, so also check the file's actual leading bytes.
const hasImageSignature = (buf: Buffer): boolean => {
  const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isWebp;
};

export const uploadSingleImage = (req: Request, res: Response, next: NextFunction) => {
  upload(req, res, (err?: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      return res.status(400).json({ success: false, error: message });
    }
    if (req.file && !hasImageSignature(req.file.buffer)) {
      return res.status(400).json({ success: false, error: 'File content is not a valid JPG, PNG or WEBP image' });
    }
    next();
  });
};

/** The most pictures one place suggestion can carry. */
export const MAX_PLACE_PHOTOS = 5;
const uploadPlacePhotos = images.array('photos', MAX_PLACE_PHOTOS);

/** Up to 5 pictures in the multipart field "photos" (req.files); each one is checked like a single photo. */
export const uploadPhotos = (req: Request, res: Response, next: NextFunction) => {
  uploadPlacePhotos(req, res, (err?: unknown) => {
    if (err) {
      const tooMany = err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE';
      const message = tooMany ? `Add up to ${MAX_PLACE_PHOTOS} pictures` : err instanceof Error ? err.message : 'Upload failed';
      return res.status(400).json({ success: false, error: message });
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.some((f) => !hasImageSignature(f.buffer))) {
      return res.status(400).json({ success: false, error: 'File content is not a valid JPG, PNG or WEBP image' });
    }
    next();
  });
};
