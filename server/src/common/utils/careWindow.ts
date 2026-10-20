const DAY = 24 * 60 * 60 * 1000;

/** Care can be logged this long before it is due, and not earlier. */
export const OPENS_BEFORE_DUE_MS = DAY;

type ScheduledTree = {
  plantedAt: Date;
  lastWateredAt: Date | null;
  lastFertilizedAt: Date | null;
  lastWeededAt: Date | null;
  waterEveryDays: number;
  fertilizeEveryDays: number;
  weedEveryDays: number;
};

export type ScheduledAction = 'WATERED' | 'FERTILIZED' | 'WEEDED';

/** What each action is called in a sentence ("Watering opens in 3 days"). */
export const ACTION_NOUN: Record<ScheduledAction, string> = { WATERED: 'Watering', FERTILIZED: 'Fertilising', WEEDED: 'Removing the grass' };

export const isScheduledAction = (action: string): action is ScheduledAction => action === 'WATERED' || action === 'FERTILIZED' || action === 'WEEDED';

/**
 * When this kind of care opens for a tree: its interval after the last time it was done (or after planting,
 * if it never was), minus one day. A tree watered every 5 days can be watered again from day 4. Pruning and
 * checking have no schedule, so they are never locked.
 */
export function careOpensAt(tree: ScheduledTree, action: string): Date | null {
  if (!isScheduledAction(action)) return null;
  const [last, everyDays] =
    action === 'WATERED' ? [tree.lastWateredAt, tree.waterEveryDays] : action === 'FERTILIZED' ? [tree.lastFertilizedAt, tree.fertilizeEveryDays] : [tree.lastWeededAt, tree.weedEveryDays];
  // Never watered counts as "needs water" everywhere in the app, so there is nothing to wait for
  if (action === 'WATERED' && !last) return null;
  const base = (last ?? tree.plantedAt).getTime();
  return new Date(base + everyDays * DAY - OPENS_BEFORE_DUE_MS);
}

/** "3 days 22 hours", "5 hours", "20 minutes". */
export function waitText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days} ${days === 1 ? 'day' : 'days'}${rest ? ` ${rest} ${rest === 1 ? 'hour' : 'hours'}` : ''}`;
}
