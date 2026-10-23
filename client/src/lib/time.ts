/** Every time in the app reads like "9:30 am" (12-hour with am/pm), never "21:30". */
export const formatTime = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

/** A stored "14:30" (how drive times are saved) as "2:30 pm". Anything that isn't a time is shown as it is. */
export const formatClock = (hhmm: string | null | undefined): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  return formatTime(new Date(2000, 0, 1, Number(m[1]), Number(m[2])));
};
