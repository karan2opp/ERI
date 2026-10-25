import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { Bell, CalendarDays, MapPinPlus, Sprout, UserPlus } from 'lucide-react';
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
  PLACE_SUGGESTED: { icon: <MapPinPlus />, tone: 'bg-water/12 text-water' },
};

/**
 * Your notifications: how many you haven't read, and the list (10 at a time from the server, loaded with `load`).
 * New ones arrive live and play a soft chime (which can be switched off); `ringing` is true for a moment after one
 * arrives. Signed out, everything stays empty. `navigate` can open a notification's link inside the app (returning
 * true); otherwise the link opens as a normal page load.
 */
export function useInbox(navigate?: (link: string) => boolean) {
  const { isSignedIn } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sound, setSound] = useState(chimeEnabled);
  const [ringing, setRinging] = useState(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;

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

  /** Marks it read and opens what it is about. */
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
    if (n.link && !navigate?.(n.link)) window.location.assign(n.link);
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

  return { unread, items, page, totalPages, loading, failed, sound, ringing, load, openItem, readAll, toggleSound };
}

export type Inbox = ReturnType<typeof useInbox>;

/** The list of notifications, newest first, with "Mark all as read" and "Show older". */
export const NotificationList: React.FC<{ inbox: Inbox }> = ({ inbox }) => {
  const { unread, items, page, totalPages, loading, failed, load, openItem, readAll } = inbox;
  return (
    <div className="flex flex-col">
      {unread > 0 && (
        <button type="button" onClick={readAll} className="cursor-pointer self-start rounded-lg px-2 py-2 text-sm font-medium text-primary hover:bg-muted">
          Mark all as read
        </button>
      )}
      {failed ? (
        <p className="p-4 text-sm text-destructive">Couldn't load your notifications. Try again.</p>
      ) : items === null ? (
        <div className="grid place-items-center p-6">
          <Spinner label="Loading notifications" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary">
            <Bell className="size-6" aria-hidden="true" />
          </span>
          <p className="text-muted-foreground">No notifications yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openItem(n)}
                className={cn(
                  'flex w-full cursor-pointer gap-3 rounded-2xl px-3 py-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  !n.readAt && 'bg-secondary/50'
                )}
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
        <div className="py-3">
          <Button variant="secondary" className="w-full" onClick={() => load(page + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Show older'}
          </Button>
        </div>
      )}
    </div>
  );
};
