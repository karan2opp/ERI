import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SignInButton, useAuth, useUser } from '@clerk/react';
import { CalendarDays, ChevronRight, LogOut, Moon, Shield, Sun, Trees, UserRound, X } from 'lucide-react';
import { useThemeChoice, type ThemeChoice } from '../lib/theme';
import { cn } from '../lib/cn';
import type { Role } from '../types';
import { ROLE_LABEL, isAdminRole } from '../lib/roles';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Chips } from './ui/chips';

const THEMES: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun className="size-4" aria-hidden="true" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="size-4" aria-hidden="true" /> },
];

const NavRow: React.FC<{ icon: React.ReactNode; label: string; hint?: string; onClick: () => void }> = ({ icon, label, hint, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-14 w-full cursor-pointer items-center gap-4 rounded-2xl px-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-primary [&>svg]:size-5">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{label}</span>
      {hint && <span className="block truncate text-sm text-muted-foreground">{hint}</span>}
    </span>
    <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
  </button>
);

/**
 * The round profile button over the map, and the drawer it opens from the right: who you are,
 * your numbers, and every place you can go (my trees, drives, account, admin), plus theme and sign out.
 * Drives are open to everyone here; the server only sends each person the ones they may see. Signed out, it offers sign-in.
 */
export const ProfileDrawer: React.FC<{
  role: Role;
  treesPlanted: number;
  upcomingDrives: number;
  onMyTrees: () => void;
  onDrives: () => void;
  onAccount: () => void;
  onAdmin: () => void;
}> = ({ role, treesPlanted, upcomingDrives, onMyTrees, onDrives, onAccount, onAdmin }) => {
  const isAdmin = isAdminRole(role);
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useThemeChoice();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const name = user?.fullName || user?.username || 'You';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={isSignedIn ? 'Your profile' : 'Profile and sign in'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="grid size-12 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-card md:size-14 text-foreground shadow-float hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isSignedIn && user?.imageUrl ? <img src={user.imageUrl} alt="" className="size-full object-cover" /> : <UserRound className="size-6" />}
      </button>

      {/* Rendered into <body>: inside the floating top bar it would be stuck at the bar's layer,
          underneath the bottom sheet, whatever its own z-index */}
      {open &&
        createPortal(
        <div className="fixed inset-0 z-[1300]">
          <div className="absolute inset-0 bg-black/35 animate-[pt-fade_200ms_ease-out]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Profile"
            className="pt-safe pb-safe absolute inset-y-0 right-0 flex w-[min(24rem,90vw)] flex-col overflow-y-auto rounded-l-3xl bg-card px-4 shadow-sheet animate-[pt-slide-in_260ms_cubic-bezier(0.2,0.8,0.2,1)]"
          >
            <div className="flex justify-end">
              <Button variant="ghost" size="icon-lg" onClick={() => setOpen(false)} aria-label="Close profile">
                <X className="size-6!" />
              </Button>
            </div>

            {isSignedIn ? (
              <>
                <div className="flex items-center gap-4 px-2">
                  {user?.imageUrl ? (
                    <img src={user.imageUrl} alt="" className="size-16 shrink-0 rounded-full bg-muted object-cover" />
                  ) : (
                    <span className="grid size-16 place-items-center rounded-full bg-secondary"><UserRound className="size-7" /></span>
                  )}
                  <div className="min-w-0">
                    <h2 className="truncate text-xl">{name}</h2>
                    <p className="truncate text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
                    {role !== 'USER' && <Badge variant="primary" className="mt-1">{ROLE_LABEL[role]}</Badge>}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 px-2">
                  <div className="rounded-2xl bg-muted p-3">
                    <p className="font-heading text-2xl font-bold tabular-nums">{treesPlanted}</p>
                    <p className="text-sm text-muted-foreground">{treesPlanted === 1 ? 'tree planted' : 'trees planted'}</p>
                  </div>
                  <div className="rounded-2xl bg-muted p-3">
                    <p className="font-heading text-2xl font-bold tabular-nums">{upcomingDrives}</p>
                    <p className="text-sm text-muted-foreground">{upcomingDrives === 1 ? 'drive coming up' : 'drives coming up'}</p>
                  </div>
                </div>

                <nav className="mt-4 flex flex-col gap-1" aria-label="Profile">
                  <NavRow icon={<Trees />} label="My trees" hint="Water and track the trees you planted" onClick={go(onMyTrees)} />
                  <NavRow icon={<CalendarDays />} label="Drives" hint="Plantation and clean-up drives, upcoming and past" onClick={go(onDrives)} />
                  <NavRow icon={<UserRound />} label="Account" hint="Name, photo and password" onClick={go(onAccount)} />
                  {isAdmin && <NavRow icon={<Shield />} label="Admin" hint="Users, trees and scheduling drives" onClick={go(onAdmin)} />}
                </nav>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3 px-2">
                  <h2 className="text-2xl">Welcome</h2>
                  <p className="text-muted-foreground">Sign in to plant trees and keep them cared for.</p>
                  <SignInButton mode="modal">
                    <Button size="xl" className="w-full" onClick={() => setOpen(false)}>Sign in</Button>
                  </SignInButton>
                </div>
                <nav className="mt-4 flex flex-col gap-1" aria-label="Drives">
                  <NavRow icon={<CalendarDays />} label="Drives" hint="Plantation and clean-up drives, upcoming and past" onClick={go(onDrives)} />
                </nav>
              </>
            )}

            <section className="mt-4 flex flex-col gap-2 px-2" aria-labelledby="drawer-appearance">
              <h3 id="drawer-appearance" className="font-sans text-sm font-medium text-muted-foreground">Appearance</h3>
              <Chips label="Theme" options={THEMES} value={theme} onChange={setTheme} size="sm" />
            </section>

            <div className="flex-1" />
            {isSignedIn && (
              <button
                type="button"
                onClick={go(() => signOut())}
                className={cn(
                  'my-4 flex h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 font-medium text-destructive hover:bg-destructive/10',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                <LogOut className="size-5" aria-hidden="true" /> Sign out
              </button>
            )}
          </div>
        </div>,
          document.body
        )}
    </>
  );
};
