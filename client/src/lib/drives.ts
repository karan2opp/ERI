import type { Drive, DriveType, DriveVisibility } from '../types';
import { formatClock } from './time';

export const DRIVE_TYPE_LABEL: Record<DriveType, string> = {
  PLANTATION: 'Plantation drive',
  CLEANUP: 'Clean-up drive',
};

export const DRIVE_VISIBILITY_LABEL: Record<DriveVisibility, string> = {
  ALL: 'Everyone',
  TEAM: 'Team only',
};

/** "Sun, 12 October, 9:00 am" */
export const formatDriveDate = (drive: Pick<Drive, 'date' | 'time'>) => {
  const date = new Date(drive.date);
  const day = Number.isNaN(date.getTime())
    ? drive.date
    : date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' });
  return `${day}, ${formatClock(drive.time)}`;
};

export const driveMapsUrl = (drive: Drive) =>
  drive.googleMapsUrl || (drive.latitude != null ? `https://www.google.com/maps/search/?api=1&query=${drive.latitude},${drive.longitude}` : null);

/** When the drive starts (date "YYYY-MM-DD" + time "HH:MM"), or null if the date can't be read. */
export const driveStartsAt = (drive: Pick<Drive, 'date' | 'time'>): Date | null => {
  const time = /^\d{1,2}:\d{2}/.test(drive.time) ? drive.time.slice(0, 5).padStart(5, '0') : '00:00';
  const at = new Date(`${drive.date}T${time}`);
  return Number.isNaN(at.getTime()) ? null : at;
};

// A drive still counts as upcoming for a few hours after it starts, while people are on their way or there
const STILL_ON_FOR_MS = 4 * 60 * 60 * 1000;

export const isUpcoming = (drive: Pick<Drive, 'date' | 'time' | 'status'>) => {
  // A completed drive is history, whatever its date
  if (drive.status === 'COMPLETED') return false;
  const at = driveStartsAt(drive);
  return at === null || at.getTime() + STILL_ON_FOR_MS >= Date.now();
};

/** Upcoming drives soonest first, and past drives most recent first. */
export const splitDrives = (drives: Drive[]) => {
  const time = (d: Drive) => driveStartsAt(d)?.getTime() ?? Infinity;
  return {
    upcoming: drives.filter(isUpcoming).sort((a, b) => time(a) - time(b)),
    past: drives.filter((d) => !isUpcoming(d)).sort((a, b) => time(b) - time(a)),
  };
};

/** Share a drive's public page: the phone's share sheet, or copy the link on desktop. Resolves true when copied. */
export const shareDrive = async (drive: Pick<Drive, 'id' | 'title'>): Promise<boolean> => {
  const url = `${window.location.origin}/?drive=${drive.id}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: drive.title, url });
      return false;
    }
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false; // share sheet dismissed
  }
};
