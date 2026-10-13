import { Check, LocateFixed } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * "Where is the tree?": the pin stays in the middle and you move the map under it.
 * The map reports its centre; Confirm uses it.
 */
export const PickLocation: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  onLocate: () => void;
}> = ({ onConfirm, onCancel, onLocate }) => (
  <>
    <div className="top-safe pointer-events-none fixed inset-x-4 z-[1000] flex justify-center">
      <p className="rounded-full bg-card px-5 py-3 text-center font-medium shadow-float">Move the map so the pin sits on the tree</p>
    </div>

    {/* The pin: its tip marks the spot, at the exact centre of the screen */}
    <div className="pointer-events-none fixed top-1/2 left-1/2 z-[1000] -translate-x-1/2 -translate-y-full" aria-hidden="true">
      <svg viewBox="0 0 40 52" className="h-13 w-10 drop-shadow-md">
        <path d="M20 51C20 51 38 31.5 38 19A18 18 0 0 0 2 19C2 31.5 20 51 20 51Z" className="fill-primary stroke-background" strokeWidth="3" />
        <circle cx="20" cy="19" r="6.5" className="fill-primary-foreground" />
      </svg>
    </div>
    <div className="pointer-events-none fixed top-1/2 left-1/2 z-[999] size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40" aria-hidden="true" />

    <div className="pb-safe fixed inset-x-0 bottom-0 z-[1100] flex flex-col gap-3 rounded-t-3xl bg-card px-5 pt-5 shadow-sheet md:inset-x-auto md:bottom-4 md:left-4 md:w-100 md:rounded-2xl md:pb-5">
      <h2 className="text-xl">Where is the tree?</h2>
      <p className="text-muted-foreground">Zoom in close. People will walk to exactly this spot.</p>
      <div className="flex gap-2">
        <Button variant="secondary" size="icon-lg" onClick={onLocate} aria-label="Jump to my location" className="size-12">
          <LocateFixed className="size-5!" />
        </Button>
        <Button size="xl" onClick={onConfirm} className="flex-1">
          <Check aria-hidden="true" /> Confirm location
        </Button>
      </div>
      <Button variant="ghost" size="lg" onClick={onCancel}>Cancel</Button>
    </div>
  </>
);
