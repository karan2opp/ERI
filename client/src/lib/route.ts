import { useEffect, useState } from 'react';
import type { LatLng } from '../types';
import { getDistanceInMeters } from '../utils/geo';

export interface WalkRoute {
  /** [lat, lng] points for Leaflet */
  line: [number, number][];
  meters: number;
  minutes: number;
  /** True when no routing service answered and this is a straight line */
  approximate: boolean;
}

const straightLine = (from: LatLng, to: LatLng): WalkRoute => {
  const meters = getDistanceInMeters(from.lat, from.lng, to.lat, to.lng);
  return {
    line: [[from.lat, from.lng], [to.lat, to.lng]],
    meters,
    minutes: Math.max(1, Math.round(meters / 80)),
    approximate: true,
  };
};

async function fetchWalkingRoute(from: LatLng, to: LatLng, signal: AbortSignal): Promise<WalkRoute> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) return straightLine(from, to);

  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&access_token=${token}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return straightLine(from, to);
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return straightLine(from, to);

  const line: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
  return {
    line: [[from.lat, from.lng], ...line, [to.lat, to.lng]],
    meters: route.distance,
    minutes: Math.max(1, Math.round(route.duration / 60)),
    approximate: false,
  };
}

/**
 * The walking route from `from` to `to`. Fetched once per destination (moving a few metres
 * doesn't refetch); falls back to a straight line without a Mapbox token.
 */
export function useWalkingRoute(from: LatLng | null, to: LatLng | null): { route: WalkRoute | null; loading: boolean } {
  const [route, setRoute] = useState<WalkRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const hasFrom = Boolean(from);
  const toKey = to ? `${to.lat},${to.lng}` : null;

  useEffect(() => {
    if (!from || !to) {
      setRoute(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetchWalkingRoute(from, to, controller.signal)
      .then(setRoute)
      .catch(() => {
        if (!controller.signal.aborted) setRoute(straightLine(from, to));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // Only refetch when the destination changes or we first get a location
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toKey, hasFrom]);

  return { route, loading };
}
