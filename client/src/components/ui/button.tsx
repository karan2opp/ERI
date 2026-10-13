import * as React from 'react';
import { cn } from '../../lib/cn';

type Variant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'danger' | 'floating' | 'link';
type Size = 'default' | 'sm' | 'lg' | 'xl' | 'icon' | 'icon-lg';

const VARIANT: Record<Variant, string> = {
  // Main action: globe-green pill with white text
  default: 'bg-primary text-primary-foreground hover:bg-primary/85',
  // Secondary action: pale leaf pill
  secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
  outline: 'border border-border bg-transparent hover:bg-muted',
  ghost: 'hover:bg-muted',
  // Tinted rust: delete, report
  destructive: 'bg-destructive/12 text-destructive hover:bg-destructive/20',
  // Solid rust: End navigation, confirm delete
  danger: 'bg-destructive text-white hover:bg-destructive/85',
  // Map controls that float over the tiles
  floating: 'bg-card text-foreground shadow-float hover:bg-muted',
  link: 'text-foreground underline underline-offset-4 hover:underline px-0 h-auto',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  default: 'h-10 gap-2 px-4 text-[15px]',
  lg: 'h-11 gap-2 px-5 text-base',
  // 48px touch target for the main action on phones
  xl: 'h-12 gap-2 px-6 text-base',
  icon: 'size-10',
  'icon-lg': 'size-11',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const buttonClass = (variant: Variant = 'default', size: Size = 'default', className?: string) =>
  cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full font-medium whitespace-nowrap select-none transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.15em] [&_svg]:shrink-0',
    VARIANT[variant],
    SIZE[size],
    className
  );

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />
  )
);
Button.displayName = 'Button';
