import type { Tree } from '../types';

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
