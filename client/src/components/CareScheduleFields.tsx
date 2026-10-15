import { Droplets, Shovel, Sprout } from 'lucide-react';
import { Field, Input } from './ui/field';

export const DEFAULT_SCHEDULE = { water: '7', fertilize: '60', weed: '30' };
export type ScheduleInput = typeof DEFAULT_SCHEDULE;

export const MIN_DAYS = 1;
export const MAX_DAYS = 365;

/** The number of days typed, or null if it isn't a whole number from 1 to 365. */
export const parseDays = (value: string): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS ? n : null;
};

/** True when all three intervals are valid. */
export const scheduleValid = (s: ScheduleInput) => parseDays(s.water) !== null && parseDays(s.fertilize) !== null && parseDays(s.weed) !== null;

const ROWS = [
  { key: 'water' as const, label: 'Water every', icon: <Droplets className="text-water" aria-hidden="true" /> },
  { key: 'fertilize' as const, label: 'Add fertiliser every', icon: <Sprout className="text-leaf" aria-hidden="true" /> },
  { key: 'weed' as const, label: 'Remove grass every', icon: <Shovel className="text-bark" aria-hidden="true" /> },
];

/**
 * How often the tree needs each kind of care, in days: watering, fertiliser, and clearing the grass
 * around it. The app uses these to say when each task is due and when a tree needs water.
 */
export const CareScheduleFields: React.FC<{ value: ScheduleInput; onChange: (next: ScheduleInput) => void }> = ({ value, onChange }) => (
  <Field label="How often does it need care?" description={`Set in days, from ${MIN_DAYS} to ${MAX_DAYS}. You can change this later.`}>
    <div className="flex flex-col gap-2 rounded-2xl bg-muted p-3">
      {ROWS.map((r) => {
        const invalid = parseDays(value[r.key]) === null;
        return (
          <label key={r.key} className="flex items-center gap-3">
            <span className="shrink-0 [&>svg]:size-5">{r.icon}</span>
            <span className="min-w-0 flex-1">{r.label}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_DAYS}
              max={MAX_DAYS}
              step={1}
              value={value[r.key]}
              onChange={(e) => onChange({ ...value, [r.key]: e.target.value })}
              aria-label={`${r.label} (days)`}
              aria-invalid={invalid}
              className={`w-24! shrink-0 bg-card px-2 text-center ${invalid ? 'ring-2 ring-destructive' : ''}`}
            />
            <span className="w-9 shrink-0 text-muted-foreground">days</span>
          </label>
        );
      })}
    </div>
  </Field>
);
