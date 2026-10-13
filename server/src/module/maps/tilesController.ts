import { Request, Response } from 'express';
import { env } from '../../common/config/env';

/**
 * Google Map Tiles API (official 2D tiles), proxied so the API key never reaches the browser.
 * Google requires a session per map style; we create one per style and reuse it until it expires.
 * Docs: https://developers.google.com/maps/documentation/tile/2d-tiles-overview
 */

type Style = 'light' | 'dark';

// Dark mode: a pine-night roadmap that matches the app's dark theme
const DARK_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#17231c' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9dae9f' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0c1510' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#25362b' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2f4537' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1b3a28' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f2433' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

interface Session {
  token: string;
  expiresAt: number;
}

const sessions = new Map<Style, Session>();
const pending = new Map<Style, Promise<Session>>();
let lastFailure: { at: number; reason: string } | null = null;

// After a failure (e.g. the API isn't enabled), don't hammer Google: retry after a minute
const RETRY_AFTER_MS = 60_000;

const apiKey = () => env.GOOGLE_MAP_API || '';

async function createSession(style: Style): Promise<Session> {
  const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mapType: 'roadmap',
      language: 'en-IN',
      region: 'IN',
      scale: 'scaleFactor2x', // sharp on phone screens
      highDpi: true,
      ...(style === 'dark' ? { styles: DARK_STYLES } : {}),
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.session) {
    throw new Error(data?.error?.message || `createSession failed with ${res.status}`);
  }
  // expiry is in seconds since the epoch; renew an hour early
  return { token: data.session, expiresAt: Number(data.expiry) * 1000 - 60 * 60 * 1000 };
}

async function getSession(style: Style): Promise<Session> {
  const current = sessions.get(style);
  if (current && current.expiresAt > Date.now()) return current;

  if (lastFailure && Date.now() - lastFailure.at < RETRY_AFTER_MS) throw new Error(lastFailure.reason);

  let inFlight = pending.get(style);
  if (!inFlight) {
    inFlight = createSession(style)
      .then((s) => {
        sessions.set(style, s);
        lastFailure = null;
        return s;
      })
      .catch((err: Error) => {
        lastFailure = { at: Date.now(), reason: err.message };
        throw err;
      })
      .finally(() => pending.delete(style));
    pending.set(style, inFlight);
  }
  return inFlight;
}

const parseStyle = (value: unknown): Style => (value === 'dark' ? 'dark' : 'light');

/** GET /maps/tiles/status: whether Google tiles can be served (the client falls back if not). */
export const tilesStatus = async (req: Request, res: Response) => {
  if (!apiKey()) {
    return res.status(200).json({ success: true, data: { available: false, reason: 'GOOGLE_MAP_API is not set' } });
  }
  try {
    await getSession('light');
    res.status(200).json({ success: true, data: { available: true } });
  } catch (err) {
    console.warn('Google Map Tiles unavailable:', (err as Error).message);
    res.status(200).json({ success: true, data: { available: false, reason: 'Map Tiles API is not enabled for this key' } });
  }
};

/** GET /maps/tiles/:style/:z/:x/:y: one 2D tile image. */
export const getTile = async (req: Request, res: Response) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    return res.status(400).end();
  }

  try {
    const style = parseStyle(req.params.style);
    const session = await getSession(style);
    const upstream = await fetch(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${session.token}&key=${apiKey()}`);

    if (upstream.status === 401 || upstream.status === 403) {
      // Session revoked or expired early: forget it so the next request makes a new one
      sessions.delete(style);
    }
    if (!upstream.ok) return res.status(upstream.status === 404 ? 404 : 502).end();

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    // Follow Google's caching headers (the Map Tiles policy allows caching as they specify)
    res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'public, max-age=86400');
    res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(503).end();
  }
};
