import type { TreePin } from '../services/api';
import type { Tree } from '../types';
import { treeStatus } from './trees';

/** What the map is showing: its edges and zoom level. */
export interface MapView {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}

/**
 * Round the visible area outward to whole map tiles at this zoom. Small pans then ask for exactly the
 * same area (so the browser reuses its cached answer), and a little of the area around the screen is
 * already loaded when you start moving.
 */
export function snapToTiles(view: MapView): string {
  const zoom = Math.max(0, Math.min(22, Math.floor(view.zoom)));
  const step = 360 / 2 ** zoom;
  const down = (v: number) => Math.floor(v / step) * step;
  const up = (v: number) => Math.ceil(v / step) * step;
  const west = Math.max(-180, down(view.west));
  const east = Math.min(180, up(view.east));
  const south = Math.max(-90, down(view.south));
  const north = Math.min(90, up(view.north));
  return [west, south, east, north].map((v) => Number(v.toFixed(6))).join(',');
}

/** A sample (demo) tree as a map pin. */
export const pinFromTree = (t: Tree): TreePin => ({ id: t.id, lat: t.latitude, lng: t.longitude, name: t.name, needsWater: treeStatus(t) === 'thirsty' });
