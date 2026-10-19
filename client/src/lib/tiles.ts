import { useEffect, useState } from 'react';
import { api } from '../services/api';

// Map tiles. We prefer Google Maps (official Map Tiles API, served through our backend so the
// API key stays secret). If the backend says Google isn't available (e.g. the Map Tiles API
// isn't enabled for the key), we fall back to CARTO (needs VITE_CARTO_API_KEY) or OpenStreetMap.

export interface TileSource {
  url: string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
  /** Google's terms: show the Google logo and "Map data ©Google" on the map */
  google: boolean;
  /** OSM has no dark style, so dark mode inverts it with a CSS filter (see .pt-tiles-invert) */
  invertInDark: boolean;
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:5000/api/v1';
const cartoKey = import.meta.env.VITE_CARTO_API_KEY as string | undefined;

const google = (dark: boolean): TileSource => ({
  url: `${API_BASE}/maps/tiles/${dark ? 'dark' : 'light'}/{z}/{x}/{y}`,
  attribution: '',
  subdomains: 'abc',
  maxZoom: 22,
  google: true,
  invertInDark: false,
});

const fallback = (dark: boolean): TileSource =>
  cartoKey
    ? {
        url: `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
        google: false,
        invertInDark: false,
      }
    : {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abc',
        maxZoom: 19,
        google: false,
        invertInDark: true,
      };

// Whether Google tiles worked last time, so the next visit can start loading them straight away
const GOOGLE_OK_KEY = 'plantree.googleTiles';
const rememberedGoogle = (): boolean | null => {
  try {
    const value = localStorage.getItem(GOOGLE_OK_KEY);
    return value === null ? null : value === '1';
  } catch {
    return null;
  }
};

// Ask the backend once per page load whether Google tiles work
let googleAvailable: Promise<boolean> | null = null;
const checkGoogle = () =>
  (googleAvailable ??= api
    .get('/maps/tiles/status')
    .then((res) => Boolean(res.data?.data?.available))
    .catch(() => false));

/**
 * The tile source to use: Google when available, otherwise the fallback. It doesn't wait for the
 * status check: it starts with what worked last time (Google on a first visit) and switches if the
 * check, which runs in the background, says otherwise.
 */
export function useTileSource(dark: boolean): TileSource {
  const [useGoogle, setUseGoogle] = useState<boolean>(() => rememberedGoogle() ?? true);
  useEffect(() => {
    let cancelled = false;
    checkGoogle().then((ok) => {
      if (cancelled) return;
      setUseGoogle(ok);
      try {
        localStorage.setItem(GOOGLE_OK_KEY, ok ? '1' : '0');
      } catch {
        // Storage blocked: we'll just check again next time
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return useGoogle ? google(dark) : fallback(dark);
}
