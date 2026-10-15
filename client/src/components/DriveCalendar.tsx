import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchDriveCalendar, localToday } from '../services/api';
import { Button } from './ui/button';
import { cn } from '../lib/cn';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * A month calendar for picking a day. Days with drives get a dot (and the count in
 * their label); today has a ring; the chosen day is filled. Tap the chosen day again to clear it.
 */
export const DriveCalendar: React.FC<{ value: string | null; onChange: (date: string | null) => void }> = ({ value, onChange }) => {
  const start = value ?? localToday();
  const [year, setYear] = useState(Number(start.slice(0, 4)));
  const [month, setMonth] = useState(Number(start.slice(5, 7)) - 1); // 0-11
  const [marks, setMarks] = useState<Record<string, number>>({});

  // Which days this month have drives
  useEffect(() => {
    let cancelled = false;
    fetchDriveCalendar(`${year}-${pad(month + 1)}`).then(
      (days) => !cancelled && setMarks(Object.fromEntries(days.map((d) => [d.date, d.count]))),
      () => !cancelled && setMarks({})
    );
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const shift = (by: number) => {
    const d = new Date(year, month + by, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const today = localToday();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first: how many blank cells before the 1st
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const title = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="rounded-2xl bg-muted p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <p className="font-heading font-bold" aria-live="polite">{title}</p>
        <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={title}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-xs font-medium text-muted-foreground" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const date = ymd(year, month, day);
          const count = marks[date] ?? 0;
          const selected = value === date;
          const label = new Date(year, month, day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
          return (
            <button
              key={date}
              type="button"
              onClick={() => onChange(selected ? null : date)}
              aria-pressed={selected}
              aria-label={`${label}${count ? `, ${count} drive${count > 1 ? 's' : ''}` : ''}`}
              className={cn(
                'relative mx-auto grid size-10 cursor-pointer place-items-center rounded-full text-[15px] tabular-nums transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-accent',
                !selected && date === today && 'ring-2 ring-primary/40',
                !selected && count > 0 && 'font-semibold'
              )}
            >
              {day}
              {count > 0 && (
                <span
                  aria-hidden="true"
                  className={cn('absolute bottom-1 size-1.5 rounded-full', selected ? 'bg-primary-foreground' : 'bg-bark')}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
