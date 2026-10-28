import * as React from 'react';
import { Droplet, Shovel, Sprout } from 'lucide-react';
import { cn } from '../../lib/cn';

type Variant = 'healthy' | 'thirsty' | 'fertilize' | 'weed' | 'water' | 'drive' | 'cleanup' | 'secondary' | 'outline' | 'primary';

const VARIANT: Record<Variant, string> = {
  healthy: 'bg-leaf/15 text-leaf',
  thirsty: 'bg-thirsty/12 text-thirsty',
  fertilize: 'bg-fertilize/14 text-fertilize',
  weed: 'bg-weed/14 text-weed',
  water: 'bg-water/15 text-water',
  drive: 'bg-bark/15 text-bark',
  cleanup: 'bg-cleanup/15 text-cleanup',
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
    {variant === 'fertilize' && <Sprout aria-hidden="true" />}
    {variant === 'weed' && <Shovel aria-hidden="true" />}
    {children}
  </span>
);

/** A small status marker: leaf dot for healthy, red water drop for needs water, orange sprout for fertiliser, teal shovel for grass, bark dot for drives. */
export const StatusDot: React.FC<{ status: 'healthy' | 'thirsty' | 'fertilize' | 'weed' | 'drive'; className?: string }> = ({ status, className }) =>
  status === 'thirsty' ? (
    <Droplet aria-hidden="true" className={cn('size-4 shrink-0 fill-thirsty text-thirsty', className)} />
  ) : status === 'fertilize' ? (
    <Sprout aria-hidden="true" className={cn('size-4 shrink-0 text-fertilize', className)} />
  ) : status === 'weed' ? (
    <Shovel aria-hidden="true" className={cn('size-4 shrink-0 text-weed', className)} />
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
