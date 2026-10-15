import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

// Filled inputs with no outline, and 16px text so iOS doesn't zoom in.
const inputBase =
  'w-full rounded-2xl bg-input px-4 text-base text-foreground placeholder:text-muted-foreground/80 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputBase, 'h-12', className)} {...props} />
);
Input.displayName = 'Input';

/** A drop-down list styled like Input, with its own chevron (the browser's arrow is hidden). */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(inputBase, 'h-12 cursor-pointer appearance-none pr-11', className)} {...props}>
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
  </div>
));
Select.displayName = 'Select';

/**
 * A text box that grows with what you type: it starts at `rows` lines, gets taller as you write,
 * and only scrolls once it reaches 60% of the screen height.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, value, ...props }, ref) => {
    const inner = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = (el: HTMLTextAreaElement | null) => {
      inner.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    };

    // Fit the height to the text whenever it changes (including when it's filled in for editing)
    React.useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    }, [value]);

    return (
      <textarea
        ref={setRefs}
        rows={rows}
        value={value}
        className={cn(inputBase, 'max-h-[60vh] resize-none overflow-y-auto py-3 leading-relaxed', className)}
        {...props}
      />
    );
  }
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
