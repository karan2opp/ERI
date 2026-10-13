import { cn } from '../../lib/cn';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/**
 * Single-choice pill chips (filters, care type, species). The selected chip is solid forest.
 * Rendered as a radio group so screen readers announce the choice.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'default',
}: {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex gap-2', className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'lg' ? 'h-12 px-5 text-base' : size === 'sm' ? 'h-9 px-3.5 text-[15px]' : 'h-10 px-4 text-[15px]',
              selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent'
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
