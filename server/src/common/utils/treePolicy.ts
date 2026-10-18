import { distanceMeters } from './geo';

/** A tree can only be registered when the person is standing within this many metres of it. */
export const MAX_PLANTING_DISTANCE_M = 15;

/**
 * The phone's own estimate of how far off its GPS fix could be. A fix worse than this can't back up
 * a claim of being within 15 m, so the person is asked to try again somewhere with a clearer sky.
 */
export const MAX_GPS_ACCURACY_M = 20;

/** null when the person is close enough, otherwise what to tell them. */
export function checkPlantingLocation(
  tree: { latitude: number; longitude: number },
  device: { latitude: number; longitude: number; accuracy: number }
): string | null {
  if (device.accuracy > MAX_GPS_ACCURACY_M) {
    return `Your location isn't precise enough yet (about ${Math.round(device.accuracy)} m off). Step into the open, wait a few seconds and try again.`;
  }
  const away = distanceMeters(tree.latitude, tree.longitude, device.latitude, device.longitude);
  if (away > MAX_PLANTING_DISTANCE_M) {
    return `You can only register a tree within ${MAX_PLANTING_DISTANCE_M} m of where you are standing. This one is about ${Math.round(away)} m away.`;
  }
  return null;
}
