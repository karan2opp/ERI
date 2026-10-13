import { useEffect, useState } from 'react';

const DAY = 24 * 60 * 60 * 1000;

export interface Age {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  /** Whole days since planting */
  totalDays: number;
}

/** `d` moved forward `n` calendar months, kept on the last day if that month is shorter (31 Jan + 1 = 29 Feb). */
const addMonths = (d: Date, n: number) => {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
};

/**
 * Age the way people count birthdays: whole calendar months since planting (shown as years and
 * months), then the days, hours and minutes after the last monthly anniversary.
 */
export function treeAge(plantedAt: Date, now: Date = new Date()): Age {
  if (now <= plantedAt) return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, totalDays: 0 };

  let totalMonths = (now.getFullYear() - plantedAt.getFullYear()) * 12 + (now.getMonth() - plantedAt.getMonth());
  if (addMonths(plantedAt, totalMonths) > now) totalMonths -= 1;
  const rest = now.getTime() - addMonths(plantedAt, totalMonths).getTime();

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: Math.floor(rest / DAY),
    hours: Math.floor((rest % DAY) / 3_600_000),
    minutes: Math.floor((rest % 3_600_000) / 60_000),
    totalDays: Math.floor((now.getTime() - plantedAt.getTime()) / DAY),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "2 years, 3 months, 5 days"; "12 days"; "4 h 12 min" for a tree planted today. */
export function formatAge(age: Age): string {
  const parts: string[] = [];
  if (age.years) parts.push(plural(age.years, 'year'));
  if (age.months) parts.push(plural(age.months, 'month'));
  if (age.days) parts.push(plural(age.days, 'day'));
  if (parts.length) return parts.join(', ');
  if (age.hours || age.minutes) return `${age.hours ? `${age.hours} h ` : ''}${age.minutes} min`;
  return 'Just planted';
}

/** Short form for lists: "2 y 3 m", "5 m 12 d", "12 d", "4 h". */
export function formatAgeShort(age: Age): string {
  if (age.years) return `${age.years} y${age.months ? ` ${age.months} m` : ''}`;
  if (age.months) return `${age.months} m${age.days ? ` ${age.days} d` : ''}`;
  if (age.days) return `${age.days} d`;
  return age.hours ? `${age.hours} h` : `${age.minutes} min`;
}

/** "Mon, 14 Oct 2024, 3:10 pm" */
export const formatDateTime = (d: Date) =>
  d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The current time, refreshed every `intervalMs` (default a minute) so ages tick along. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
