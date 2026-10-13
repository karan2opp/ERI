import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Drive, LatLng, Tree, User } from '../types';
import { createGlobalDrive, fetchAdminStats, fetchAdminTrees, fetchAdminUsers } from '../services/api';
import { geocodeLocation } from '../utils/geo';
import { timeAgo } from '../lib/trees';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Chips } from '../components/ui/chips';
import { Field, Input, Textarea } from '../components/ui/field';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { MiniMap } from '../components/MiniMap';
import { DriveView } from '../components/DriveView';
import { DrivesBrowser } from '../components/DrivesBrowser';
import { Pager } from '../components/ui/pager';
import { Stat } from './MyTreesPage';

type Tab = 'overview' | 'drives' | 'trees' | 'users';

const TABS = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'drives' as const, label: 'Drives' },
  { value: 'trees' as const, label: 'Trees' },
  { value: 'users' as const, label: 'People' },
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

/** Paged, searchable admin list (trees or people). */
function usePagedList<T>(fetcher: (page: number, limit: number, search: string) => Promise<{ success: boolean; data: T[]; total: number; totalPages: number }>) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: T[]; total: number; totalPages: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetcher(page, 20, search.trim()).then(
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
  const [stats, setStats] = useState<{ totalUsers: number; totalTrees: number } | null>(null);
  useEffect(() => {
    fetchAdminStats().then((res) => res.success && setStats(res.stats), () => {});
  }, []);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat value={stats?.totalTrees ?? '–'} label="trees on the map" />
      <Stat value={stats?.totalUsers ?? '–'} label="people signed up" />
    </div>
  );
};

const TreesList: React.FC = () => {
  const list = usePagedList<Tree>(fetchAdminTrees);
  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search trees by name or kind" />
      {list.error && <Alert tone="error">Couldn't load trees. Refresh to try again.</Alert>}
      {!list.data ? (
        <Spinner />
      ) : (
        <>
          <p className="text-muted-foreground">{list.data.total} trees</p>
          <ul className="divide-y divide-border">
            {list.data.rows.map((t) => (
              <li key={t.id} className="flex items-center gap-4 py-3">
                <img src={t.photoUrl} alt="" className="size-12 shrink-0 rounded-xl bg-muted object-cover" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{t.species}{t.address ? ` · ${t.address}` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
          <Pager page={list.page} totalPages={list.data.totalPages} onPage={list.setPage} />
        </>
      )}
    </div>
  );
};

const PeopleList: React.FC = () => {
  const list = usePagedList<User & { createdAt: string }>(fetchAdminUsers);
  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search people by name or email" />
      {list.error && <Alert tone="error">Couldn't load people. Refresh to try again.</Alert>}
      {!list.data ? (
        <Spinner />
      ) : (
        <>
          <p className="text-muted-foreground">{list.data.total} people</p>
          <ul className="divide-y divide-border">
            {list.data.rows.map((u) => (
              <li key={u.id} className="flex items-center gap-4 py-3">
                <img src={u.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${u.id}`} alt="" className="size-11 shrink-0 rounded-full bg-muted" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.name || 'No name'}</p>
                  <p className="truncate text-sm text-muted-foreground">{u.email} · joined {timeAgo(u.createdAt)}</p>
                </div>
                {u.role === 'ADMIN' && <Badge variant="primary">Admin</Badge>}
              </li>
            ))}
          </ul>
          <Pager page={list.page} totalPages={list.data.totalPages} onPage={list.setPage} />
        </>
      )}
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

export const AdminPage: React.FC<{ you: LatLng | null; onClose: () => void; onShowDriveOnMap: (d: Drive) => void }> = ({ you, onClose, onShowDriveOnMap }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [drive, setDrive] = useState<Drive | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // The admin page stays underneath while a drive or the schedule form is open,
  // so going back keeps the tab, search, filters and page you were on
  return (
    <>
      <Page title="Admin" onBack={onClose} wide>
        <Chips label="Section" options={TABS} value={tab} onChange={setTab} className="no-scrollbar -mx-4 overflow-x-auto px-4" />
        {tab === 'overview' && <Overview />}
        {tab === 'drives' && (
          <DrivesBrowser
            onOpen={setDrive}
            refreshKey={refreshKey}
            actions={
              <Button size="xl" onClick={() => setCreating(true)} className="w-full">
                <Plus aria-hidden="true" /> Schedule a drive
              </Button>
            }
          />
        )}
        {tab === 'trees' && <TreesList />}
        {tab === 'users' && <PeopleList />}
      </Page>

      {drive && (
        <Page title="Drive" onBack={() => setDrive(null)}>
          <DriveView drive={drive} you={you} onShowOnMap={onShowDriveOnMap} />
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
