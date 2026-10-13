import { useEffect, useRef, useState } from 'react';
import { SignInButton, useAuth, useUser } from '@clerk/react';
import { LogOut, Shield, Trees, UserRound } from 'lucide-react';
import { cn } from '../lib/cn';

const item =
  'flex h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-base hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-5 [&>svg]:text-muted-foreground';

/**
 * The round account button over the map. Signed out it opens Clerk's sign-in; signed in it opens
 * a menu (a bottom sheet on phones, a popover on wider screens).
 */
export const AccountMenu: React.FC<{
  isAdmin: boolean;
  onMyTrees: () => void;
  onAccount: () => void;
  onAdmin: () => void;
}> = ({ isAdmin, onMyTrees, onAccount, onAdmin }) => {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const round = 'grid size-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-card text-foreground shadow-float hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button type="button" className={round} aria-label="Sign in">
          <UserRound className="size-6" />
        </button>
      </SignInButton>
    );
  }

  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative">
      <button type="button" className={round} aria-label="Your account" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {user?.imageUrl ? <img src={user.imageUrl} alt="" className="size-full object-cover" /> : <UserRound className="size-6" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1200] bg-black/30 md:bg-transparent" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={panelRef}
            role="menu"
            aria-label="Account"
            className={cn(
              'pb-safe fixed inset-x-0 bottom-0 z-[1300] rounded-t-3xl bg-card p-3 shadow-sheet animate-rise',
              'md:absolute md:inset-x-auto md:top-16 md:right-0 md:bottom-auto md:w-80 md:rounded-2xl md:pb-3'
            )}
          >
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-accent md:hidden" aria-hidden="true" />
            <div className="flex items-center gap-3 px-3 py-3">
              {user?.imageUrl && <img src={user.imageUrl} alt="" className="size-11 rounded-full" />}
              <div className="min-w-0">
                <p className="truncate font-medium">{user?.fullName || user?.username || 'You'}</p>
                <p className="truncate text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
              </div>
            </div>
            <div className="my-1 h-px bg-border" />
            <button role="menuitem" className={item} onClick={go(onMyTrees)}>
              <Trees aria-hidden="true" /> My trees
            </button>
            <button role="menuitem" className={item} onClick={go(onAccount)}>
              <UserRound aria-hidden="true" /> Account and settings
            </button>
            {isAdmin && (
              <button role="menuitem" className={item} onClick={go(onAdmin)}>
                <Shield aria-hidden="true" /> Admin
              </button>
            )}
            <div className="my-1 h-px bg-border" />
            <button role="menuitem" className={cn(item, 'text-destructive [&>svg]:text-destructive')} onClick={go(() => signOut())}>
              <LogOut aria-hidden="true" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
};
