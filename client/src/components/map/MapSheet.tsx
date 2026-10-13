import { useRef } from 'react';
import { cn } from '../../lib/cn';

export type SheetState = 'collapsed' | 'half' | 'full';

const UP: Record<SheetState, SheetState> = { collapsed: 'half', half: 'full', full: 'full' };
const DOWN: Record<SheetState, SheetState> = { collapsed: 'collapsed', half: 'collapsed', full: 'half' };
// A tap on the handle toggles between closed and open
const TAP: Record<SheetState, SheetState> = { collapsed: 'half', half: 'collapsed', full: 'half' };

/**
 * The map's bottom sheet on phones (drag or tap the handle: a compact bar, 46% of the screen, or
 * nearly full), and a full-height side panel on wider screens.
 *
 * Collapsed, it shows `peek` (a one-line bar made for that state, like the search box or the
 * selected tree's name) instead of cutting the full content in half. Its bottom padding includes
 * the phone's navigation bar / home indicator (env(safe-area-inset-bottom)), so nothing sits
 * under it.
 */
export const MapSheet: React.FC<{
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  label: string;
  header?: React.ReactNode;
  /** The compact bar shown when collapsed on phones */
  peek?: React.ReactNode;
  /** Shown just above the sheet's top edge on phones (the map credit) */
  above?: React.ReactNode;
  children: React.ReactNode;
}> = ({ state, onStateChange, label, header, peek, above, children }) => {
  const drag = useRef<number | null>(null);
  const collapsed = state === 'collapsed';
  const hasPeek = Boolean(peek);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current === null) return;
    const dy = e.clientY - drag.current;
    drag.current = null;
    if (Math.abs(dy) < 8) onStateChange(TAP[state]);
    else onStateChange(dy < 0 ? UP[state] : DOWN[state]);
  };

  return (
    <section
      aria-label={label}
      data-state={state}
      className={cn(
        'group fixed inset-x-0 bottom-0 z-[1100] flex flex-col bg-card shadow-sheet',
        'rounded-t-3xl transition-[max-height] duration-300 ease-out',
        'max-md:data-[state=half]:max-h-[46dvh] max-md:data-[state=full]:max-h-[88dvh]',
        'md:inset-x-auto md:top-4 md:bottom-4 md:left-4 md:w-100 md:rounded-2xl'
      )}
    >
      {above && <div className="pointer-events-none absolute -top-8 left-4 md:hidden">{above}</div>}
      <button
        type="button"
        aria-label={collapsed ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
        aria-expanded={!collapsed}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        className="flex h-7 w-full shrink-0 cursor-grab touch-none items-center justify-center rounded-t-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <span className="h-1.5 w-10 rounded-full bg-accent" />
      </button>

      {/* Phones, collapsed: just the compact bar, clear of the phone's navigation bar */}
      {collapsed && hasPeek && <div className="pb-safe px-5 pt-1 animate-rise md:hidden">{peek}</div>}

      {/* Open on phones, and always on wider screens */}
      <div className={cn('flex min-h-0 flex-1 flex-col', collapsed && hasPeek && 'max-md:hidden', collapsed && !hasPeek && 'max-md:max-h-[calc(4rem+env(safe-area-inset-bottom))] max-md:overflow-hidden')}>
        {header && <div className="shrink-0 px-5 pt-1 md:pt-5">{header}</div>}
        <div className="pb-safe min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3">{children}</div>
      </div>
    </section>
  );
};
