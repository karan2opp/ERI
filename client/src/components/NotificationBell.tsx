import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/react';
import { Bell, CalendarDays, Sprout, UserPlus, Volume2, VolumeX, X } from 'lucide-react';
import { fetchInbox, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, type InboxItem } from '../services/api';
import { getSocket, reconnectSocket } from '../utils/socket';
import { chimeEnabled, playChime, setChimeEnabled, unlockChimeOnFirstTap } from '../lib/chime';
import { timeAgo } from '../lib/trees';
import { cn } from '../lib/cn';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

const ICON: Record<InboxItem['type'], { icon: React.ReactNode; tone: string }> = {
  DRIVE_SCHEDULED: { icon: <CalendarDays />, tone: 'bg-bark/12 text-bark' },
  USER_JOINED: { icon: <UserPlus />, tone: 'bg-secondary text-primary' },
  TREE_PLANTED: { icon: <Sprout />, tone: 'bg-leaf/12 text-leaf' },
};

/**
 * The bell: how many notifications you haven't read, and the list when tapped (10 at a time from the server).
 * New ones arrive live and play a soft chime (which can be switched off). Tapping one marks it read and opens
 * what it is about. Signed-out visitors don't see the bell.
 */
export const NotificationBell: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isSignedIn } = useAuth();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sound, setSound] = useState(chimeEnabled);
  const [ringing, setRinging] = useState(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [panelTop, setPanelTop] = useState(72);

  useEffect(() => unlockChimeOnFirstTap(), []);

  // The count, then live updates over the app's connection
  useEffect(() => {
    if (!isSignedIn) {
      setUnread(0);
      setItems(null);
      return;
    }
    const refresh = () => fetchUnreadCount().then(setUnread, () => {});
    refresh();

    const socket = getSocket();
    const onNotice = (n: InboxItem) => {
      setUnread((u) => u + 1);
      setItems((list) => (list ? [n, ...list.filter((x) => x.id !== n.id)] : list));
      if (soundRef.current) playChime();
      setRinging(true);
      window.setTimeout(() => setRinging(false), 1200);
    };
    socket.on('notification', onNotice);

    // A connection made before sign-in doesn't know who you are: reconnect once so the server can send to you
    let reconnected = false;
    const hello = () =>
      socket.emit('inbox:hello', (known: boolean) => {
        if (!known && !reconnected) {
          reconnected = true;
          reconnectSocket();
        }
      });
    if (socket.connected) hello();
    socket.on('connect', hello);

    // Catch up after the tab was in the background
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.off('notification', onNotice);
      socket.off('connect', hello);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isSignedIn]);

  const load = async (p: number) => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetchInbox(p);
      setItems((list) => (p === 1 || !list ? res.data : [...list, ...res.data.filter((n) => !list.some((x) => x.id === n.id))]));
      setPage(res.page);
      setTotalPages(res.totalPages);
      setUnread(res.unread);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const openPanel = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    setPanelTop(Math.round((rect?.bottom ?? 64) + 8));
    setOpen(true);
    void load(1);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openItem = async (n: InboxItem) => {
    if (!n.readAt) {
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? list);
      setUnread((u) => Math.max(0, u - 1));
      try {
        setUnread(await markNotificationRead(n.id));
      } catch {
        // Opening it matters more than the dot
      }
    }
    if (n.link) window.location.assign(n.link);
  };

  const readAll = async () => {
    setItems((list) => list?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? list);
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      // The next load shows the truth
    }
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setChimeEnabled(next);
    if (next) playChime();
  };

  if (!isSignedIn) return null;

  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'relative grid shrink-0 cursor-pointer place-items-center bg-card text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          compact ? 'size-9 rounded-lg ring-1 ring-border' : 'size-12 rounded-full shadow-float md:size-14'
        )}
      >
        <Bell className={cn(compact ? 'size-[18px]' : 'size-6', ringing && 'motion-safe:animate-[pt-ring_0.6s_ease-in-out_2]')} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] leading-none font-bold text-primary-foreground ring-2 ring-background" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[1250]" onClick={() => setOpen(false)}>
            <div
              role="dialog"
              aria-label="Notifications"
              onClick={(e) => e.stopPropagation()}
              style={{ top: panelTop }}
              className="absolute right-4 flex max-h-[min(32rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl bg-card shadow-sheet ring-1 ring-border animate-rise"
            >
              <div className="flex items-center gap-1 border-b border-border px-4 py-3">
                <h2 className="flex-1 font-heading text-lg">Notifications</h2>
                <Button variant="ghost" size="icon" onClick={toggleSound} aria-label={sound ? 'Turn notification sound off' : 'Turn notification sound on'} title={sound ? 'Sound on' : 'Sound off'}>
                  {sound ? <Volume2 className="size-5!" /> : <VolumeX className="size-5!" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close notifications">
                  <X className="size-5!" />
                </Button>
              </div>

              {unread > 0 && (
                <button type="button" onClick={readAll} className="cursor-pointer border-b border-border px-4 py-2 text-left text-sm font-medium text-primary hover:bg-muted">
                  Mark all as read
                </button>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto">
                {failed ? (
                  <p className="p-4 text-sm text-destructive">Couldn't load your notifications. Try again.</p>
                ) : items === null ? (
                  <div className="grid place-items-center p-6">
                    <Spinner label="Loading notifications" />
                  </div>
                ) : items.length === 0 ? (
                  <p className="p-6 text-center text-muted-foreground">No notifications yet.</p>
                ) : (
                  <ul>
                    {items.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openItem(n)}
                          className={cn('flex w-full cursor-pointer gap-3 px-4 py-3 text-left hover:bg-muted', !n.readAt && 'bg-secondary/50')}
                        >
                          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg [&>svg]:size-[18px]', ICON[n.type]?.tone ?? 'bg-secondary text-primary')} aria-hidden="true">
                            {ICON[n.type]?.icon ?? <Bell />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn('block text-[15px] leading-snug', !n.readAt && 'font-semibold')}>{n.title}</span>
                            {n.body && <span className="block truncate text-sm text-muted-foreground">{n.body}</span>}
                            <span className="block text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                          </span>
                          {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {items && page < totalPages && (
                  <div className="p-3">
                    <Button variant="secondary" className="w-full" onClick={() => load(page + 1)} disabled={loading}>
                      {loading ? 'Loading…' : 'Show older'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
