import { useEffect, useState } from 'react';
import type { Tree } from '../types';
import { searchPlacesApi } from '../services/api';

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** Trees on the map that match `query` (instant), plus places from the geocoder (debounced). */
export function useSearch(query: string, trees: Tree[]) {
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const q = query.trim().toLowerCase();
  const active = q.length >= 2;

  const matchingTrees = active
    ? trees
        .filter((t) => t.name.toLowerCase().includes(q) || t.species.toLowerCase().includes(q) || t.address?.toLowerCase().includes(q))
        .slice(0, 5)
    : [];

  useEffect(() => {
    if (!active) {
      setPlaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await searchPlacesApi(q);
        if (!cancelled) setPlaces(res.success && Array.isArray(res.data) ? res.data.slice(0, 5) : []);
      } catch {
        if (!cancelled) setPlaces([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, active]);

  return { active, trees: matchingTrees, places, loading };
}
