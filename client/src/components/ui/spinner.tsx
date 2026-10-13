import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export const Spinner: React.FC<{ className?: string; label?: string }> = ({ className, label = 'Loading' }) => (
  <Loader2 role="status" aria-label={label} className={cn('size-5 animate-spin', className)} />
);
