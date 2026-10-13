import { Field, Input } from './ui/field';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date and time parts of a Date, for date/time inputs. */
export const toLocalParts = (d: Date) => ({
  date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
});

/** The chosen local date and time as a Date, or null if incomplete. */
export const fromLocalParts = (date: string, time: string): Date | null => {
  if (!date) return null;
  const d = new Date(`${date}T${time || '00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * When the tree was planted: a date and a time. Its age and birthday are counted from this.
 * Dates in the future can't be picked.
 */
export const PlantedAtField: React.FC<{
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  description?: string;
}> = ({ date, time, onDate, onTime, description = "Its age and birthday are counted from this." }) => {
  const today = toLocalParts(new Date()).date;
  return (
    <Field label="When was it planted?" description={description}>
      <div className="grid grid-cols-[3fr_2fr] gap-3">
        <Input type="date" value={date} max={today} min="1900-01-01" onChange={(e) => onDate(e.target.value)} aria-label="Planting date" />
        <Input type="time" value={time} onChange={(e) => onTime(e.target.value)} aria-label="Planting time" />
      </div>
    </Field>
  );
};
