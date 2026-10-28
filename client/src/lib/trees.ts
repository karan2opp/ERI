import type { Tree } from '../types';

/** Days between waterings, unless the tree sets its own. */
export const DEFAULT_WATER_EVERY_DAYS = 7;

/** A tree can only be registered when you are standing within this many metres of it (the server checks too). */
export const MAX_PLANTING_DISTANCE_M = 15;
/** Your phone's GPS has to be at least this precise (metres) to back that up. */
export const MAX_GPS_ACCURACY_M = 20;

export const isPending = (tree: Pick<Tree, 'verificationStatus'>) => tree.verificationStatus === 'PENDING';

/** What a tree can need, most urgent first: water, then fertiliser, then the grass around it removed. */
export type TreeNeed = 'thirsty' | 'fertilize' | 'weed';
export type TreeStatus = 'healthy' | TreeNeed;

export const hoursSinceWatered = (tree: Pick<Tree, 'lastWateredAt'>): number | null =>
  tree.lastWateredAt ? (Date.now() - new Date(tree.lastWateredAt).getTime()) / 3_600_000 : null;

type CareFields = Pick<Tree, 'lastWateredAt'> &
  Partial<Pick<Tree, 'plantedAt' | 'lastFertilizedAt' | 'lastWeededAt' | 'waterEveryDays' | 'fertilizeEveryDays' | 'weedEveryDays'>>;

const DAY_MS = 24 * 3_600_000;

/** Past its interval since the last time, or since planting if it never happened (the server uses the same rule). */
const overdue = (lastDoneAt: string | null | undefined, plantedAt: string | undefined, everyDays: number | undefined): boolean => {
  const from = lastDoneAt ?? plantedAt;
  return Boolean(from && everyDays) && new Date(from!).getTime() + everyDays! * DAY_MS < Date.now();
};

/**
 * Everything a tree needs right now, most urgent first. Water: gone longer than its own watering interval
 * without it, and a tree never watered needs it at once. Fertiliser and grass removal: their intervals have
 * passed since the last time, or since planting.
 */
export const treeNeeds = (tree: CareFields): TreeNeed[] => {
  const needs: TreeNeed[] = [];
  const hours = hoursSinceWatered(tree);
  if (hours === null || hours > (tree.waterEveryDays ?? DEFAULT_WATER_EVERY_DAYS) * 24) needs.push('thirsty');
  if (overdue(tree.lastFertilizedAt, tree.plantedAt, tree.fertilizeEveryDays)) needs.push('fertilize');
  if (overdue(tree.lastWeededAt, tree.plantedAt, tree.weedEveryDays)) needs.push('weed');
  return needs;
};

/** The tree's main status: its most urgent need, or healthy when it needs nothing. */
export const treeStatus = (tree: CareFields): TreeStatus => treeNeeds(tree)[0] ?? 'healthy';

export const STATUS_LABEL: Record<TreeStatus, string> = {
  healthy: 'Healthy',
  thirsty: 'Needs water',
  fertilize: 'Needs fertiliser',
  weed: 'Needs grass removal',
};

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export const timeAgo = (iso: string): string => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const CARE_ACTIONS = ['WATERED', 'FERTILIZED', 'WEEDED', 'PRUNED', 'INSPECTED'] as const;
export type CareAction = (typeof CARE_ACTIONS)[number];

export const CARE_LABEL: Record<CareAction, string> = {
  WATERED: 'Watered',
  FERTILIZED: 'Fertilised',
  WEEDED: 'Grass removed',
  PRUNED: 'Pruned',
  INSPECTED: 'Checked',
};

/** "Neem (Azadirachta indica)" -> "Neem" */
export const shortSpecies = (species: string) => species.split(' (')[0];
