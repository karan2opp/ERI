import * as React from 'react';
import { Droplet } from 'lucide-react';
import { cn } from '../../lib/cn';

type Variant = 'healthy' | 'thirsty' | 'water' | 'drive' | 'secondary' | 'outline' | 'primary';

const VARIANT: Record<Variant, string> = {
  healthy: 'bg-leaf/15 text-leaf',
  thirsty: 'bg-thirsty/12 text-thirsty',
  water: 'bg-water/15 text-water',
  drive: 'bg-bark/15 text-bark',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border border-border text-muted-foreground',
  primary: 'bg-primary text-primary-foreground',
};

export const Badge: React.FC<React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }> = ({
  className,
  variant = 'secondary',
  children,
  ...props
}) => (
  <span
    className={cn(
      'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap [&_svg]:size-3.5',
      VARIANT[variant],
      className
    )}
    {...props}
  >
    {variant === 'thirsty' && <Droplet className="fill-current" aria-hidden="true" />}
    {children}
  </span>
);

/** A small status marker: leaf dot for healthy, blue water drop for needs water, bark dot for drives. */
export const StatusDot: React.FC<{ status: 'healthy' | 'thirsty' | 'drive'; className?: string }> = ({ status, className }) =>
  status === 'thirsty' ? (
    <Droplet aria-hidden="true" className={cn('size-4 shrink-0 fill-thirsty text-thirsty', className)} />
  ) : (
  <span
    aria-hidden="true"
    className={cn(
      'size-3 shrink-0 rounded-full',
      status === 'healthy' ? 'bg-leaf' : 'bg-bark',
      className
    )}
  />
  );
