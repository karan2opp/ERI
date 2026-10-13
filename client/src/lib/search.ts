import { useEffect, useState } from 'react';
import type { LatLng, Tree } from '../types';
import { browseTrees, searchPlacesApi } from '../services/api';

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * Search as you type (after a short pause): the top 5 matching trees from the server (nearest
 * first when we know where you are) and the top 5 places from the geocoder.
 */
export function useSearch(query: string, near: LatLng | null) {
  const [trees, setTrees] = useState<(Tree & { distance?: number })[]>([]);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const q = query.trim();
  const active = q.length >= 2;
  // Only the rough area matters for ordering, so small GPS jitter doesn't repeat the search
  const area = near ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : '';

  useEffect(() => {
    if (!active) {
      setTrees([]);
      setPlaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [treeRes, placeRes] = await Promise.allSettled([
        browseTrees({ page: 1, limit: 5, search: q, near }),
        searchPlacesApi(q),
      ]);
      if (cancelled) return;
      setTrees(treeRes.status === 'fulfilled' ? treeRes.value.data : []);
      setPlaces(placeRes.status === 'fulfilled' && placeRes.value.success && Array.isArray(placeRes.value.data) ? placeRes.value.data.slice(0, 5) : []);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `near` is represented by `area`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, active, area]);

  return { active, trees, places, loading };
}
