import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Drive, DriveType, DriveVisibility, LatLng, Tree, User } from '../types';
import { createGlobalDrive, fetchAdminStats, fetchAdminUsers } from '../services/api';
import { AdminReview } from '../components/AdminReview';
import { useUser } from '@clerk/react';
import { formatPhone } from '../lib/phone';
import { RoleSelect } from '../components/RoleSelect';
import { AdminUserProfile } from '../components/AdminUserProfile';
import { geocodeLocation } from '../utils/geo';
import { timeAgo } from '../lib/trees';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Chips } from '../components/ui/chips';
import { Field, Input, Textarea } from '../components/ui/field';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { MiniMap } from '../components/MiniMap';
import { DriveView } from '../components/DriveView';
import { DrivesBrowser } from '../components/DrivesBrowser';
import { AdminTrees } from '../components/AdminTrees';
import { Pager } from '../components/ui/pager';
import { Stat } from './MyTreesPage';

type Tab = 'overview' | 'drives' | 'trees' | 'review' | 'users';

const TABS = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'drives' as const, label: 'Drives' },
  { value: 'trees' as const, label: 'Trees' },
  { value: 'review' as const, label: 'Review' },
  { value: 'users' as const, label: 'Users' },
];

// Mumbai, when we don't know where you are
const FALLBACK_CENTER: LatLng = { lat: 19.076, lng: 72.8777 };

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => (
  <div className="relative">
    <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-12 w-full rounded-full bg-input pr-4 pl-12 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  </div>
);

const USERS_PER_PAGE = 10;

/** Paged, searchable admin list. */
function usePagedList<T>(
  fetcher: (page: number, limit: number, search: string) => Promise<{ success: boolean; data: T[]; total: number; totalPages: number }>,
  pageSize: number
) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: T[]; total: number; totalPages: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetcher(page, pageSize, search.trim()).then(
        (res) => !cancelled && setData({ rows: res.data, total: res.total, totalPages: res.totalPages }),
        () => !cancelled && setError(true)
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  return { search, setSearch: (s: string) => (setSearch(s), setPage(1)), page, setPage, data, error };
}

const Overview: React.FC = () => {
  const [stats, setStats] = useState<{ totalUsers: number; totalTrees: number; pendingTrees: number } | null>(null);
  useEffect(() => {
    fetchAdminStats().then((res) => res.success && setStats(res.stats), () => {});
  }, []);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat value={stats?.totalTrees ?? '–'} label="trees on the map" />
      <Stat value={stats?.totalUsers ?? '–'} label="users signed up" />
      <Stat value={stats?.pendingTrees ?? '–'} label="photos to review" tone={stats?.pendingTrees ? 'thirsty' : undefined} />
    </div>
  );
};

/** One user: tap the person to open their profile, or use the role picker on the right. */
const UserRow: React.FC<{ user: User & { createdAt: string }; isSelf: boolean; onOpen: () => void }> = ({ user, isSelf, onOpen }) => {
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-xl py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open the profile of ${user.name || user.email}`}
      >
        <img src={user.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.id}`} alt="" className="size-11 shrink-0 rounded-full bg-muted" loading="lazy" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {user.name || 'No name'}
            {isSelf && <span className="ml-2 font-normal text-muted-foreground">(you)</span>}
          </span>
          <span className="block truncate text-sm text-muted-foreground">{user.email}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {user.phone ? formatPhone(user.phone) : 'No phone number'}
            <span className="max-sm:hidden"> · joined {timeAgo(user.createdAt)}</span>
          </span>
        </span>
      </button>
      <div className="shrink-0">
        <RoleSelect user={user} isSelf={isSelf} onError={setError} />
      </div>
      {error && <p role="alert" className="basis-full pl-14 text-sm text-destructive">{error}</p>}
    </li>
  );
};

const UsersList: React.FC<{ onShowTreeOnMap: (t: Tree) => void }> = ({ onShowTreeOnMap }) => {
  const list = usePagedList<User & { createdAt: string }>(fetchAdminUsers, USERS_PER_PAGE);
  const { user: me } = useUser();
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search users by name, email or phone" />
      {list.error && <Alert tone="error">Couldn't load users. Refresh to try again.</Alert>}
      {!list.data ? (
        <Spinner />
      ) : (
        <>
          <p className="text-muted-foreground">
            {list.data.total} {list.data.total === 1 ? 'user' : 'users'}
            {list.search.trim() ? ` matching "${list.search.trim()}"` : ''}
          </p>
          <ul className="divide-y divide-border">
            {list.data.rows.map((u) => (
              <UserRow key={u.id} user={u} isSelf={u.id === me?.id} onOpen={() => setOpenUserId(u.id)} />
            ))}
          </ul>
          {list.data.rows.length === 0 && <p className="py-4 text-center text-muted-foreground">No users match that search.</p>}
          <Pager
            page={list.page}
            totalPages={list.data.totalPages}
            onPage={list.setPage}
            alwaysShow
            total={list.data.total}
            pageSize={USERS_PER_PAGE}
            noun={list.data.total === 1 ? 'user' : 'users'}
          />
        </>
      )}
      {openUserId && <AdminUserProfile userId={openUserId} isSelf={openUserId === me?.id} onClose={() => setOpenUserId(null)} onShowTreeOnMap={onShowTreeOnMap} />}
    </div>
  );
};

const DriveForm: React.FC<{ you: LatLng | null; onDone: () => void }> = ({ you, onDone }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [type, setType] = useState<DriveType>('PLANTATION');
  // Team only unless chosen otherwise, so a drive is never public by accident
  const [visibility, setVisibility] = useState<DriveVisibility>('TEAM');
  const [center, setCenter] = useState<LatLng>(you ?? FALLBACK_CENTER);
  const [recenter, setRecenter] = useState(0);
  const [place, setPlace] = useState('');
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findPlace = async () => {
    if (!place.trim()) return;
    setFinding(true);
    const found = await geocodeLocation(place.trim());
    setFinding(false);
    if (found) {
      setCenter(found);
      setRecenter((r) => r + 1);
      if (!address) setAddress(place.trim());
    } else {
      setError(`Couldn't find "${place.trim()}". Try a nearby landmark.`);
    }
  };

  const blocker = !title.trim() ? 'Add a title to continue' : !date || !time ? 'Choose a date and time' : !description.trim() ? 'Say what volunteers will do' : null;

  const submit = async () => {
    if (blocker) return;
    setBusy(true);
    setError(null);
    try {
      await createGlobalDrive({
        title: title.trim(),
        description: description.trim(),
        date,
        time,
        address: address.trim(),
        googleMapsUrl: mapsUrl.trim() || undefined,
        latitude: center.lat,
        longitude: center.lng,
        type,
        visibility,
      });
      onDone();
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || "Couldn't schedule the drive. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Field label="Kind of drive">
        <Chips
          label="Kind of drive"
          value={type}
          onChange={setType}
          options={[{ value: 'PLANTATION', label: 'Plantation drive' }, { value: 'CLEANUP', label: 'Clean-up drive' }]}
          className="flex-wrap"
        />
      </Field>
      <Field label="Who can see it" description={visibility === 'ALL' ? 'Everyone, including people who are not signed in.' : 'Only team members and admins. Admins always see every drive.'}>
        <Chips
          label="Who can see it"
          value={visibility}
          onChange={setVisibility}
          options={[{ value: 'TEAM', label: 'Team only' }, { value: 'ALL', label: 'Everyone' }]}
          className="flex-wrap"
        />
      </Field>
      <Field label="Title" htmlFor="drive-title">
        <Input id="drive-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunday planting at Shivaji Park" maxLength={255} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="drive-date">
          <Input id="drive-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time" htmlFor="drive-time">
          <Input id="drive-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="What will volunteers do?" htmlFor="drive-desc" description="What to bring, where to meet, how long it takes.">
        <Textarea id="drive-desc" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </Field>
      <Field label="Where" description="Search for the area, then move the map so the pin sits on the meeting point.">
        <div className="flex gap-2">
          <Input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                findPlace();
              }
            }}
            placeholder="Search a place"
            aria-label="Search a place"
          />
          <Button variant="secondary" size="xl" onClick={findPlace} disabled={finding} aria-label="Find place">
            {finding ? <Spinner /> : <Search aria-hidden="true" />}
          </Button>
        </div>
        <MiniMap center={center} recenterToken={recenter} onCenterChange={setCenter} />
      </Field>
      <Field label="Address or landmark (optional)" htmlFor="drive-address">
        <Input id="drive-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
      </Field>
      <Field label="Google Maps link (optional)" htmlFor="drive-maps">
        <Input id="drive-maps" type="url" inputMode="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" maxLength={1000} />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button size="xl" onClick={submit} disabled={Boolean(blocker) || busy}>
        {busy && <Spinner />}
        {blocker ?? 'Schedule drive'}
      </Button>
    </div>
  );
};

export const AdminPage: React.FC<{
  you: LatLng | null;
  onClose: () => void;
  onShowDriveOnMap: (d: Drive) => void;
  onShowTreeOnMap: (t: Tree) => void;
}> = ({ you, onClose, onShowDriveOnMap, onShowTreeOnMap }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [drive, setDrive] = useState<Drive | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // How many trees wait for a photo check, shown on the Review tab
  const [pending, setPending] = useState(0);
  const loadPending = () => {
    fetchAdminStats().then((res) => res.success && setPending(res.stats.pendingTrees ?? 0), () => {});
  };
  useEffect(loadPending, []);
  const tabs = TABS.map((t) => (t.value === 'review' && pending > 0 ? { ...t, label: `Review · ${pending}` } : t));

  // The admin page stays underneath while a drive or the schedule form is open,
  // so going back keeps the tab, search, filters and page you were on
  return (
    <>
      <Page title="Admin" onBack={onClose} wide>
        <Chips label="Section" options={tabs} value={tab} onChange={setTab} className="no-scrollbar -mx-4 overflow-x-auto px-4" />
        {tab === 'overview' && <Overview />}
        {tab === 'drives' && (
          <DrivesBrowser
            onOpen={setDrive}
            refreshKey={refreshKey}
            showVisibility
            actions={
              <Button size="xl" onClick={() => setCreating(true)} className="w-full">
                <Plus aria-hidden="true" /> Schedule a drive
              </Button>
            }
          />
        )}
        {tab === 'trees' && <AdminTrees onShowOnMap={onShowTreeOnMap} />}
        {tab === 'review' && <AdminReview onReviewed={loadPending} />}
        {tab === 'users' && <UsersList onShowTreeOnMap={onShowTreeOnMap} />}
      </Page>

      {drive && (
        <Page title="Drive" onBack={() => setDrive(null)}>
          <DriveView
            drive={drive}
            you={you}
            onShowOnMap={onShowDriveOnMap}
            showVisibility
            onUpdated={(d) => {
              setDrive(d);
              setRefreshKey((k) => k + 1);
            }}
          />
        </Page>
      )}

      {creating && (
        <Page title="Schedule a drive" onBack={() => setCreating(false)}>
          <DriveForm
            you={you}
            onDone={() => {
              setCreating(false);
              setRefreshKey((k) => k + 1);
            }}
          />
        </Page>
      )}
    </>
  );
};
