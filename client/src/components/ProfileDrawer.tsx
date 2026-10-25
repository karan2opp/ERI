import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SignInButton, useAuth, useUser } from '@clerk/react';
import { ArrowLeft, Bell, CalendarDays, ChevronRight, House, LogOut, MapPinPlus, Moon, Shield, Sun, Trees, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { useThemeChoice, type ThemeChoice } from '../lib/theme';
import { cn } from '../lib/cn';
import type { Role } from '../types';
import { ROLE_LABEL, isAdminRole } from '../lib/roles';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Chips } from './ui/chips';
import { NotificationList, useInbox } from './Notifications';

const THEMES: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun className="size-4" aria-hidden="true" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="size-4" aria-hidden="true" /> },
];

const NavRow: React.FC<{ icon: React.ReactNode; label: string; hint?: string; count?: number; onClick: () => void }> = ({ icon, label, hint, count, onClick }) => (
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
    {count ? (
      <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground" aria-hidden="true">
        {count > 99 ? '99+' : count}
      </span>
    ) : null}
    <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
  </button>
);

/**
 * The round profile button over the map, and the drawer it opens from the right: who you are,
 * your numbers, your notifications, and every place you can go (my trees, drives, account, admin), plus theme
 * and sign out. Notifications live here rather than in a separate bell, so the top bar stays narrow enough for
 * small phones: the button shows how many are unread, new ones chime, and the Notifications row opens the list
 * inside the drawer.
 * Drives are open to everyone here; the server only sends each person the ones they may see. Signed out, it offers sign-in.
 */
export const ProfileDrawer: React.FC<{
  role: Role;
  /** Left out (as on the home page) hides the two number boxes */
  treesPlanted?: number;
  upcomingDrives?: number;
  onMyTrees: () => void;
  onDrives: () => void;
  onAccount: () => void;
  onAdmin: () => void;
  /** Suggest a place to plant trees or clean up */
  onPlaces: () => void;
  /** Opens a notification's link inside the app and returns true (left out on the website pages, where it is a normal page load) */
  onOpenLink?: (link: string) => boolean;
  /** Back to the home page (left out on the home page itself) */
  onHome?: () => void;
  /** A smaller, squarer button (the home page's header); the map keeps the big round one */
  compact?: boolean;
}> = ({ role, treesPlanted, upcomingDrives, onMyTrees, onDrives, onAccount, onAdmin, onPlaces, onOpenLink, onHome, compact = false }) => {
  const isAdmin = isAdminRole(role);
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useThemeChoice();
  const inbox = useInbox((link) => {
    const handled = onOpenLink?.(link) ?? false;
    // The menu is in the way of whatever it opened
    if (handled) setOpen(false);
    return handled;
  });
  // The menu, or your notifications inside the drawer
  const [view, setView] = useState<'menu' | 'notifications'>('menu');
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Always open on the menu
  useEffect(() => {
    if (!open) setView('menu');
  }, [open]);

  // Moving between the menu and the list puts focus on its first button
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [view, open]);

  const showNotifications = () => {
    setView('notifications');
    void inbox.load(1);
  };

  // Looking at the list counts as reading it: everything is marked read while it is open, including anything
  // that arrives in the meantime
  useEffect(() => {
    if (open && view === 'notifications' && inbox.unread > 0) void inbox.readAll();
    // readAll only reads state through the server, so it doesn't need to be a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, inbox.unread]);

  useEffect(() => {
    if (!open) return;
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
  const unread = isSignedIn ? inbox.unread : 0;
  const unreadText = unread ? `, ${unread} unread ${unread === 1 ? 'notification' : 'notifications'}` : '';

  return (
    <>
      <span className="relative inline-grid shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={isSignedIn ? `Your profile${unreadText}` : 'Profile and sign in'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'grid shrink-0 cursor-pointer place-items-center overflow-hidden bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          compact ? 'size-9 rounded-lg ring-1 ring-border' : 'size-12 rounded-full shadow-float md:size-14'
        )}
      >
        {isSignedIn && user?.imageUrl ? <img src={user.imageUrl} alt="" className="size-full object-cover" /> : <UserRound className={compact ? 'size-[18px]' : 'size-6'} />}
      </button>
      {unread > 0 && (
        <span
          className={cn(
            'pointer-events-none absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] leading-none font-bold text-primary-foreground ring-2 ring-background',
            inbox.ringing && 'motion-safe:animate-[pt-ring_0.6s_ease-in-out_2]'
          )}
          aria-hidden="true"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      </span>

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
            {view === 'notifications' && isSignedIn ? (
              <>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-lg" onClick={() => setView('menu')} aria-label="Back to the menu">
                    <ArrowLeft className="size-6!" />
                  </Button>
                  <h2 className="min-w-0 flex-1 truncate text-xl">Notifications</h2>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    onClick={inbox.toggleSound}
                    aria-label={inbox.sound ? 'Turn notification sound off' : 'Turn notification sound on'}
                    title={inbox.sound ? 'Sound on' : 'Sound off'}
                  >
                    {inbox.sound ? <Volume2 className="size-5!" /> : <VolumeX className="size-5!" />}
                  </Button>
                  <Button variant="ghost" size="icon-lg" onClick={() => setOpen(false)} aria-label="Close profile">
                    <X className="size-6!" />
                  </Button>
                </div>
                <div className="pb-4">
                  <NotificationList inbox={inbox} />
                </div>
              </>
            ) : (
            <>
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

                {treesPlanted !== undefined && upcomingDrives !== undefined && (
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
                )}

                <nav className="mt-4 flex flex-col gap-1" aria-label="Profile">
                  {onHome && <NavRow icon={<House />} label="Home" hint="About us, how it works and upcoming drives" onClick={go(onHome)} />}
                  <NavRow
                    icon={<Bell />}
                    label="Notifications"
                    hint={unread ? `${unread} unread` : 'New drives and updates'}
                    count={unread}
                    onClick={showNotifications}
                  />
                  <NavRow icon={<Trees />} label="My trees" hint="Water and track the trees you planted" onClick={go(onMyTrees)} />
                  <NavRow icon={<CalendarDays />} label="Drives" hint="Plantation and clean-up drives, upcoming and past" onClick={go(onDrives)} />
                  <NavRow icon={<MapPinPlus />} label="Suggest a place" hint="Tell us where to plant trees or clean up" onClick={go(onPlaces)} />
                  <NavRow icon={<UserRound />} label="Account" hint="Your details and notifications" onClick={go(onAccount)} />
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
                  {onHome && <NavRow icon={<House />} label="Home" hint="About us, how it works and upcoming drives" onClick={go(onHome)} />}
                  <NavRow icon={<CalendarDays />} label="Drives" hint="Plantation and clean-up drives, upcoming and past" onClick={go(onDrives)} />
                  <NavRow icon={<MapPinPlus />} label="Suggest a place" hint="Tell us where to plant trees or clean up" onClick={go(onPlaces)} />
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
            </>
            )}
          </div>
        </div>,
          document.body
        )}
    </>
  );
};
