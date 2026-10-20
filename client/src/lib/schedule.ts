import type { Role, Tree } from '../types';
import { isAdminRole } from './roles';

const DAY = 24 * 60 * 60 * 1000;

export type TaskKind = 'water' | 'fertilize' | 'weed';

export interface TaskDue {
  kind: TaskKind;
  label: string;
  everyDays: number;
  /** When it was last done, if ever */
  lastDoneAt: string | null;
  /** When it's next due (a day counted from the last time, or from planting if never done) */
  dueAt: Date;
  /** Whole days until due: negative when overdue, 0 today */
  daysUntil: number;
  overdue: boolean;
}

/**
 * The three recurring tasks for a tree and when each is next due: the last time it was done plus
 * its interval, or the planting date plus the interval if it's never been done.
 */
export function careDue(tree: Tree, now: Date = new Date()): TaskDue[] {
  const planted = new Date(tree.plantedAt).getTime();
  const make = (kind: TaskKind, label: string, everyDays: number, lastDoneAt: string | null | undefined): TaskDue => {
    const base = lastDoneAt ? new Date(lastDoneAt).getTime() : planted;
    const dueAt = new Date(base + everyDays * DAY);
    // Count in calendar days so "due today" stays "today" all day
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const daysUntil = Math.round((startOf(dueAt) - startOf(now)) / DAY);
    return { kind, label, everyDays, lastDoneAt: lastDoneAt ?? null, dueAt, daysUntil, overdue: dueAt.getTime() < now.getTime() && daysUntil < 0 };
  };
  return [
    make('water', 'Water', tree.waterEveryDays, tree.lastWateredAt),
    make('fertilize', 'Fertilise', tree.fertilizeEveryDays, tree.lastFertilizedAt),
    make('weed', 'Remove grass', tree.weedEveryDays, tree.lastWeededAt),
  ];
}

/** Care can be logged this long before it is due, and not earlier (the server enforces it too). */
const OPENS_BEFORE_DUE_MS = DAY;

/** The kinds of care that have a schedule. Pruning and checking don't, so they're never locked. */
const SCHEDULE_OF: Record<string, { last: 'lastWateredAt' | 'lastFertilizedAt' | 'lastWeededAt'; every: 'waterEveryDays' | 'fertilizeEveryDays' | 'weedEveryDays'; noun: string }> = {
  WATERED: { last: 'lastWateredAt', every: 'waterEveryDays', noun: 'Watering' },
  FERTILIZED: { last: 'lastFertilizedAt', every: 'fertilizeEveryDays', noun: 'Fertilising' },
  WEEDED: { last: 'lastWeededAt', every: 'weedEveryDays', noun: 'Removing the grass' },
};

/** "3 days 22 h", "5 h", "20 min". */
export function waitText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days} ${days === 1 ? 'day' : 'days'}${rest ? ` ${rest} h` : ''}`;
}

/** One unit, rounded up, for a small button: "4 d", "5 h", "20 min". */
function shortWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.ceil(hours / 24)} d`;
}

export interface CareLock {
  locked: boolean;
  /** When it opens (only when locked) */
  opensAt: Date | null;
  /** "Watering opens in 3 days 22 h", or null when it's open */
  text: string | null;
  /** A short form for a small button: "in 3 d" */
  short: string | null;
}

/**
 * Whether this kind of care can be logged right now. It opens a day before it is due: a tree watered every
 * 5 days can be watered again from day 4. Admins and super admins can always log care.
 */
export function careLock(tree: Tree, action: string, role: Role, now: Date = new Date()): CareLock {
  const open: CareLock = { locked: false, opensAt: null, text: null, short: null };
  const rule = SCHEDULE_OF[action];
  if (!rule || isAdminRole(role)) return open;
  // Never watered counts as "needs water", so watering is open
  if (action === 'WATERED' && !tree.lastWateredAt) return open;
  const base = new Date(tree[rule.last] ?? tree.plantedAt).getTime();
  const opensAt = new Date(base + tree[rule.every] * DAY - OPENS_BEFORE_DUE_MS);
  const ms = opensAt.getTime() - now.getTime();
  if (ms <= 0) return open;
  return { locked: true, opensAt, text: `${rule.noun} opens in ${waitText(ms)}`, short: `in ${shortWait(ms)}` };
}

/** "Due today", "Due tomorrow", "Due in 5 days", "Overdue by 2 days". */
export function dueText(task: Pick<TaskDue, 'daysUntil'>): string {
  const d = task.daysUntil;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d > 1) return `Due in ${d} days`;
  return `Overdue by ${-d} ${d === -1 ? 'day' : 'days'}`;
}

/** "Every day", "Every 7 days". */
export const everyText = (days: number) => (days === 1 ? 'Every day' : `Every ${days} days`);
