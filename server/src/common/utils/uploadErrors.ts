import type { Response } from 'express';
import { UploadError } from '../services/uploads';
import { BusyError } from './limitConcurrency';

/**
 * Answers the request when the error is about a photo (it could not be verified, was already used, or the server
 * is busy) and says so by returning true. Anything else is left for the caller's own error handling.
 */
export function sendUploadError(res: Response, error: unknown): boolean {
  if (error instanceof UploadError) {
    res.status(error.status).json({ success: false, code: error.code, error: error.message });
    return true;
  }
  if (error instanceof BusyError) {
    res.status(503).json({ success: false, code: 'BUSY', error: error.message });
    return true;
  }
  return false;
}
