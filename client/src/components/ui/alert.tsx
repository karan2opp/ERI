import * as React from 'react';
import { AlertCircle, CheckCircle2, Droplets, Info, Shovel, Sprout } from 'lucide-react';
import { cn } from '../../lib/cn';

type Tone = 'success' | 'error' | 'thirsty' | 'fertilize' | 'weed' | 'info';

const TONE: Record<Tone, string> = {
  success: 'bg-leaf/12',
  error: 'bg-destructive/12 text-destructive',
  thirsty: 'bg-thirsty/12',
  fertilize: 'bg-fertilize/12',
  weed: 'bg-weed/12',
  info: 'bg-muted',
};

const ICON: Record<Tone, React.ReactNode> = {
  success: <CheckCircle2 className="text-leaf" aria-hidden="true" />,
  error: <AlertCircle aria-hidden="true" />,
  thirsty: <Droplets className="text-thirsty" aria-hidden="true" />,
  fertilize: <Sprout className="text-fertilize" aria-hidden="true" />,
  weed: <Shovel className="text-weed" aria-hidden="true" />,
  info: <Info className="text-muted-foreground" aria-hidden="true" />,
};

/** Inline feedback inside sheets and forms. */
export const Alert: React.FC<{
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ tone = 'info', title, children, action, className }) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={cn('flex items-center gap-3 rounded-2xl p-4 [&>svg]:size-5 [&>svg]:shrink-0', TONE[tone], className)}
  >
    {ICON[tone]}
    <div className="min-w-0 flex-1">
      {title && <p className="font-medium text-foreground">{title}</p>}
      {children && <div className={cn('text-[15px]', Boolean(title) && 'text-muted-foreground')}>{children}</div>}
    </div>
    {action}
  </div>
);
