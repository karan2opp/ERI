import { useEffect, useState } from 'react';
import { Calendar, Check, ChevronRight, Map as MapIcon, Plus, Search, Share2 } from 'lucide-react';
import type { Drive, LatLng, Tree, User } from '../types';
import { createGlobalDrive, fetchAdminStats, fetchAdminTrees, fetchAdminUsers, fetchGlobalDrives } from '../services/api';
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
import { LiveTracker } from '../components/LiveTracker';
import { formatDriveDate } from '../lib/drives';
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

const Pager: React.FC<{ page: number; totalPages: number; onPage: (p: number) => void }> = ({ page, totalPages, onPage }) =>
  totalPages <= 1 ? null : (
    <div className="flex items-center justify-between gap-2">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="text-muted-foreground">Page {page} of {totalPages}</span>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
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
        <Textarea id="drive-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
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

const DriveView: React.FC<{ drive: Drive; onShowOnMap: (d: Drive) => void }> = ({ drive, onShowOnMap }) => {
  const [copied, setCopied] = useState(false);
  const hasSpot = drive.latitude != null && drive.longitude != null;
  const share = async () => {
    const url = `${window.location.origin}/?drive=${drive.id}`;
    try {
      if (navigator.share) await navigator.share({ title: drive.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share sheet dismissed
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Badge variant="drive" className="self-start">Planting drive</Badge>
        <h2 className="text-2xl">{drive.title}</h2>
        <p className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="size-4" aria-hidden="true" /> {formatDriveDate(drive)}
        </p>
        {drive.address && <p className="text-muted-foreground">{drive.address}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="xl" onClick={share}>
          {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />} {copied ? 'Link copied' : 'Share'}
        </Button>
        {hasSpot && (
          <Button size="xl" onClick={() => onShowOnMap(drive)}>
            <MapIcon aria-hidden="true" /> Show on map
          </Button>
        )}
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{drive.description}</p>
      <LiveTracker room={`drive_${drive.id}`} targetName={drive.title} />
      {hasSpot && <MiniMap center={{ lat: drive.latitude!, lng: drive.longitude! }} pin={{ lat: drive.latitude!, lng: drive.longitude! }} liveRoom={`drive_${drive.id}`} />}
    </div>
  );
};

const DrivesTab: React.FC<{ onOpen: (d: Drive) => void; onNew: () => void; refreshKey: number }> = ({ onOpen, onNew, refreshKey }) => {
  const [drives, setDrives] = useState<Drive[] | null>(null);
  useEffect(() => {
    fetchGlobalDrives().then((res) => setDrives(res.success ? res.data : []), () => setDrives([]));
  }, [refreshKey]);

  return (
    <div className="flex flex-col gap-4">
      <Button size="xl" onClick={onNew}>
        <Plus aria-hidden="true" /> Schedule a drive
      </Button>
      {!drives ? (
        <Spinner />
      ) : drives.length === 0 ? (
        <p className="py-4 text-center text-muted-foreground">No drives yet. Schedule one and share the link with volunteers.</p>
      ) : (
        <ul className="divide-y divide-border">
          {drives.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => onOpen(d)} className="flex w-full cursor-pointer items-center gap-4 rounded-lg py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-bark/15 text-bark">
                  <Calendar className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-medium">{d.title}</span>
                  <span className="block truncate text-muted-foreground">{formatDriveDate(d)}</span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const AdminPage: React.FC<{ you: LatLng | null; onClose: () => void; onShowDriveOnMap: (d: Drive) => void }> = ({ you, onClose, onShowDriveOnMap }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [drive, setDrive] = useState<Drive | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (creating) {
    return (
      <Page title="Schedule a drive" onBack={() => setCreating(false)}>
        <DriveForm
          you={you}
          onDone={() => {
            setCreating(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      </Page>
    );
  }

  if (drive) {
    return (
      <Page title="Drive" onBack={() => setDrive(null)}>
        <DriveView drive={drive} onShowOnMap={onShowDriveOnMap} />
      </Page>
    );
  }

  return (
    <Page title="Admin" onBack={onClose}>
      <Chips label="Section" options={TABS} value={tab} onChange={setTab} className="no-scrollbar -mx-4 overflow-x-auto px-4" />
      {tab === 'overview' && <Overview />}
      {tab === 'drives' && <DrivesTab onOpen={setDrive} onNew={() => setCreating(true)} refreshKey={refreshKey} />}
      {tab === 'trees' && <TreesList />}
      {tab === 'users' && <PeopleList />}
    </Page>
  );
};
