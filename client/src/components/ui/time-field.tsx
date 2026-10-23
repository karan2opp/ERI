import { useEffect, useState } from 'react';
import { Select } from './field';

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

type Parts = { hour: string; minute: string; period: 'am' | 'pm' };

/** "14:30" to { hour: "2", minute: "30", period: "pm" }; empty parts for an empty value. */
const toParts = (value: string): Parts => {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return { hour: '', minute: '', period: 'am' };
  const h = Number(m[1]);
  return { hour: String(h % 12 || 12), minute: m[2], period: h < 12 ? 'am' : 'pm' };
};

/** Back to "14:30", or '' while the hour or minutes are still missing. */
const fromParts = ({ hour, minute, period }: Parts): string => {
  if (!hour || !minute) return '';
  const h = (Number(hour) % 12) + (period === 'pm' ? 12 : 0);
  return `${pad(h)}:${minute}`;
};

/**
 * A time picked as hour, minutes and am/pm, so it reads the same on every phone and computer (the browser's
 * own time box shows 24-hour on many of them). The value in and out is "HH:MM" (24-hour), or '' until complete.
 */
export const TimeField: React.FC<{ id?: string; value: string; onChange: (value: string) => void; label: string }> = ({ id, value, onChange, label }) => {
  const [parts, setParts] = useState<Parts>(() => toParts(value));

  // A new value from outside (a drive opened for editing) replaces what is shown
  useEffect(() => {
    if (value !== fromParts(parts)) setParts(toParts(value));
    // Only when the value changes from outside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const set = (patch: Partial<Parts>) => {
    const next = { ...parts, ...patch };
    setParts(next);
    onChange(fromParts(next));
  };

  return (
    <div role="group" aria-label={label} className="grid grid-cols-[1fr_1fr_1.1fr] gap-2">
      <Select id={id} aria-label="Hour" value={parts.hour} onChange={(e) => set({ hour: e.target.value })}>
        <option value="" disabled>Hour</option>
        {HOURS.map((h) => (
          <option key={h} value={String(h)}>{h}</option>
        ))}
      </Select>
      <Select aria-label="Minutes" value={parts.minute} onChange={(e) => set({ minute: e.target.value })}>
        <option value="" disabled>Min</option>
        {MINUTES.map((m) => (
          <option key={m} value={pad(m)}>{pad(m)}</option>
        ))}
      </Select>
      <Select aria-label="am or pm" value={parts.period} onChange={(e) => set({ period: e.target.value as 'am' | 'pm' })}>
        <option value="am">am</option>
        <option value="pm">pm</option>
      </Select>
    </div>
  );
};
