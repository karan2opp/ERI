import { cn } from '../../lib/cn';

/** An on/off switch with a label and a line of explanation. */
export const SwitchRow: React.FC<{
  id: string;
  label: string;
  description: React.ReactNode;
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}> = ({ id, label, description, checked, busy = false, disabled = false, onChange }) => (
  <div className="flex items-start gap-4 py-4">
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="block text-base font-medium">{label}</label>
      <p id={`${id}-desc`} className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={`${id}-desc`}
      disabled={busy || disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative mt-0.5 h-8 w-14 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        checked ? 'bg-primary' : 'bg-border'
      )}
    >
      <span className={cn('absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-6')} />
    </button>
  </div>
);
