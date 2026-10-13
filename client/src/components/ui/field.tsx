import * as React from 'react';
import { cn } from '../../lib/cn';

// Filled inputs with no outline, and 16px text so iOS doesn't zoom in.
const inputBase =
  'w-full rounded-2xl bg-input px-4 text-base text-foreground placeholder:text-muted-foreground/80 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputBase, 'h-12', className)} {...props} />
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(inputBase, 'resize-none py-3 leading-relaxed', className)} {...props} />
  )
);
Textarea.displayName = 'Textarea';

/** Label above, the control, optional description below. */
export const Field: React.FC<{
  label: string;
  htmlFor?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ label, htmlFor, description, children, className }) => (
  <div className={cn('flex flex-col gap-2', className)}>
    <label htmlFor={htmlFor} className="text-base font-medium">
      {label}
    </label>
    {children}
    {description && <p className="text-sm text-muted-foreground">{description}</p>}
  </div>
);
