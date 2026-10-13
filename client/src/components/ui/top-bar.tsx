import { ArrowLeft } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/cn';

/** Back arrow and screen title for full-screen pages. */
export const TopBar: React.FC<{ title: string; onBack: () => void; action?: React.ReactNode }> = ({ title, onBack, action }) => (
  <header className="pt-safe sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-background/95 px-2 pb-2 backdrop-blur">
    <Button variant="ghost" size="icon-lg" onClick={onBack} aria-label="Back">
      <ArrowLeft className="size-6!" />
    </Button>
    <h1 className="min-w-0 flex-1 truncate text-2xl">{title}</h1>
    {action && <div className="pr-2">{action}</div>}
  </header>
);

/**
 * Full-screen page shell: top bar, a centred content column, and an optional
 * sticky footer for the page's one main action.
 */
export const Page: React.FC<{
  title: string;
  onBack: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ title, onBack, action, children, footer, wide }) => {
  const width = wide ? 'max-w-3xl' : 'max-w-xl';
  return (
    <div className="fixed inset-0 z-[1500] flex flex-col overflow-y-auto bg-background animate-rise">
      <TopBar title={title} onBack={onBack} action={action} />
      <main className={cn('mx-auto flex w-full flex-1 flex-col gap-6 p-4', width)}>{children}</main>
      {footer && (
        <div className="pb-safe sticky bottom-0 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur">
          <div className={cn('mx-auto w-full', width)}>{footer}</div>
        </div>
      )}
    </div>
  );
};
