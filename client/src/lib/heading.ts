import { useEffect, useState } from 'react';

// Only report a new heading when it has turned this much, so the cone doesn't jitter
const MIN_CHANGE_DEG = 4;

const angleBetween = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Which way the phone is facing, in degrees clockwise from north (null when unknown).
 *
 * Uses the phone's compass where the browser exposes it without asking (Chrome on Android sends
 * `deviceorientationabsolute`). Otherwise falls back to the direction you're walking, which GPS
 * reports only while you're moving (`gpsHeading`). Never asks for permission.
 */
export function useHeading(gpsHeading: number | null): number | null {
  const [compass, setCompass] = useState<number | null>(null);

  useEffect(() => {
    let last: number | null = null;
    const onOrientation = (e: DeviceOrientationEvent) => {
      // The compass bearing: a real absolute reading, or Safari's own compass value
      const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      const bearing = typeof webkit === 'number' ? webkit : e.absolute && typeof e.alpha === 'number' ? (360 - e.alpha) % 360 : null;
      if (bearing === null || Number.isNaN(bearing)) return;
      if (last === null || angleBetween(bearing, last) >= MIN_CHANGE_DEG) {
        last = bearing;
        setCompass(bearing);
      }
    };
    window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
    return () => window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
  }, []);

  return compass ?? (gpsHeading !== null && Number.isFinite(gpsHeading) ? gpsHeading : null);
}
