import type { Drive } from '../types';

/** "Sun, 12 October, 09:00" */
export const formatDriveDate = (drive: Pick<Drive, 'date' | 'time'>) => {
  const date = new Date(drive.date);
  const day = Number.isNaN(date.getTime())
    ? drive.date
    : date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' });
  return `${day}, ${drive.time}`;
};

export const driveMapsUrl = (drive: Drive) =>
  drive.googleMapsUrl || (drive.latitude != null ? `https://www.google.com/maps/search/?api=1&query=${drive.latitude},${drive.longitude}` : null);
