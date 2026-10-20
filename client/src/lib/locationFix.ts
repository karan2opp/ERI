/** A position worked out from several GPS readings taken while the person stood still. */
export interface LocationFix {
  lat: number;
  lng: number;
  /** The best (smallest) error the phone reported, in metres. Kept as the honest figure. */
  accuracy: number;
  /** How many readings went into it */
  samples: number;
}

export type FixFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export class FixError extends Error {
  reason: FixFailure;
  constructor(reason: FixFailure) {
    super(reason);
    this.reason = reason;
  }
}

/** Stop early once this many readings in a row are this good. */
const GOOD_ENOUGH_M = 6;
const MIN_SAMPLES_EARLY = 4;
const MIN_WAIT_MS = 3000;
/** Otherwise keep listening this long, then use what we have */
const SETTLE_MS = 10_000;
/** Give up if not a single reading has arrived */
const HARD_TIMEOUT_MS = 20_000;

/**
 * Takes a fresh GPS fix right now: listens for a few seconds and averages the readings, trusting the
 * accurate ones more. GPS error is mostly random, so the average lands closer than the first reading.
 * `onProgress` gets the best accuracy seen so far, to show the person while they wait.
 */
export function captureLocation(onProgress?: (bestAccuracy: number | null, samples: number) => void): { result: Promise<LocationFix>; cancel: () => void } {
  let cancel = () => {};
  const result = new Promise<LocationFix>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new FixError('unsupported'));
    const readings: { lat: number; lng: number; accuracy: number }[] = [];
    const startedAt = Date.now();
    let finished = false;
    let watchId: number | null = null;
    const timers: number[] = [];

    const finish = (action: () => void) => {
      if (finished) return;
      finished = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      timers.forEach(clearTimeout);
      action();
    };

    const best = () => Math.min(...readings.map((r) => r.accuracy));
    const average = (): LocationFix => {
      const bestAccuracy = best();
      // Drop readings much worse than the best one, then weight the rest by 1 / error²
      const used = readings.filter((r) => r.accuracy <= Math.max(bestAccuracy * 2, bestAccuracy + 3));
      let weight = 0;
      let lat = 0;
      let lng = 0;
      for (const r of used) {
        const w = 1 / (Math.max(r.accuracy, 1) ** 2);
        weight += w;
        lat += r.lat * w;
        lng += r.lng * w;
      }
      return { lat: lat / weight, lng: lng / weight, accuracy: bestAccuracy, samples: used.length };
    };

    cancel = () => finish(() => reject(new FixError('timeout')));

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!Number.isFinite(pos.coords.accuracy)) return;
        readings.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        onProgress?.(best(), readings.length);
        const waited = Date.now() - startedAt;
        const good = readings.filter((r) => r.accuracy <= GOOD_ENOUGH_M).length;
        if (waited >= MIN_WAIT_MS && good >= MIN_SAMPLES_EARLY) finish(() => resolve(average()));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) finish(() => reject(new FixError('denied')));
        else if (readings.length === 0 && err.code === err.POSITION_UNAVAILABLE) finish(() => reject(new FixError('unavailable')));
        // A timeout on one reading: the watch keeps going, and the timers below decide when to stop
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    );

    timers.push(
      window.setTimeout(() => finish(() => (readings.length ? resolve(average()) : reject(new FixError('timeout')))), SETTLE_MS),
      window.setTimeout(() => finish(() => (readings.length ? resolve(average()) : reject(new FixError('timeout')))), HARD_TIMEOUT_MS)
    );
  });
  return { result, cancel: () => cancel() };
}
