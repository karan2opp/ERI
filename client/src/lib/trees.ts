import type { Tree } from '../types';

/** A tree needs water once it has gone this long without care. */
export const THIRSTY_AFTER_HOURS = 48;

export type TreeStatus = 'healthy' | 'thirsty';

export const hoursSinceWatered = (tree: Pick<Tree, 'lastWateredAt'>): number | null =>
  tree.lastWateredAt ? (Date.now() - new Date(tree.lastWateredAt).getTime()) / 3_600_000 : null;

export const treeStatus = (tree: Pick<Tree, 'lastWateredAt'>): TreeStatus => {
  const hours = hoursSinceWatered(tree);
  return hours === null || hours > THIRSTY_AFTER_HOURS ? 'thirsty' : 'healthy';
};

export const STATUS_LABEL: Record<TreeStatus, string> = {
  healthy: 'Healthy',
  thirsty: 'Needs water',
};

/** Demo and sample trees are generated on the client and don't exist on the server. */
export const isDemoTree = (tree: Pick<Tree, 'id'>) => tree.id.startsWith('demo-') || tree.id.startsWith('mock-');

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

export const CARE_ACTIONS = ['WATERED', 'FERTILIZED', 'PRUNED', 'INSPECTED'] as const;
export type CareAction = (typeof CARE_ACTIONS)[number];

export const CARE_LABEL: Record<CareAction, string> = {
  WATERED: 'Watered',
  FERTILIZED: 'Fed',
  PRUNED: 'Pruned',
  INSPECTED: 'Checked',
};

export const SPECIES_PRESETS = [
  'Neem (Azadirachta indica)',
  'Peepal (Ficus religiosa)',
  'Banyan (Ficus benghalensis)',
  'Mango (Mangifera indica)',
  'Jamun (Syzygium cumini)',
  'Ashoka (Saraca asoca)',
  'Gulmohar (Delonix regia)',
  'Jacaranda (Jacaranda mimosifolia)',
];

/** "Neem (Azadirachta indica)" -> "Neem" */
export const shortSpecies = (species: string) => species.split(' (')[0];
