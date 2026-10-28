import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Drive, LatLng, Role, Tree, User } from '../types';
import { fetchAdminStats, fetchAdminUsers } from '../services/api';
import { DriveForm, notifyMessage } from '../components/DriveForm';
import { AdminReview } from '../components/AdminReview';
import { AdminCategories } from '../components/AdminCategories';
import { AdminSettings } from '../components/AdminSettings';
import { AdminSiteLinks } from '../components/AdminSiteLinks';
import { AdminPlaces } from '../components/AdminPlaces';
import { AdminMedia } from '../components/AdminMedia';
import { ViewerRoleContext } from '../lib/viewerRole';
import { useUser } from '@clerk/react';
import { formatPhone } from '../lib/phone';
import { RoleSelect } from '../components/RoleSelect';
import { AdminUserProfile } from '../components/AdminUserProfile';
import { timeAgo } from '../lib/trees';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Chips } from '../components/ui/chips';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { DriveView } from '../components/DriveView';
import { DrivesBrowser } from '../components/DrivesBrowser';
import { AdminTrees } from '../components/AdminTrees';
import { Pager } from '../components/ui/pager';
import { Stat } from './MyTreesPage';

type Tab = 'overview' | 'drives' | 'trees' | 'places' | 'media' | 'categories' | 'review' | 'users' | 'socials' | 'settings';

const TABS = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'drives' as const, label: 'Drives' },
  { value: 'trees' as const, label: 'Trees' },
  { value: 'places' as const, label: 'Places' },
  { value: 'media' as const, label: 'Media' },
  { value: 'categories' as const, label: 'Categories' },
  { value: 'review' as const, label: 'Review' },
  { value: 'users' as const, label: 'Users' },
  { value: 'socials' as const, label: 'Socials' },
  { value: 'settings' as const, label: 'Settings' },
];

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

const UsersList: React.FC<{ onShowTreeOnMap: (t: Tree) => void; initialOpenUserId?: string }> = ({ onShowTreeOnMap, initialOpenUserId }) => {
  const list = usePagedList<User & { createdAt: string }>(fetchAdminUsers, USERS_PER_PAGE);
  const { user: me } = useUser();
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  // Opened from a notification: show that person once Admin itself is on screen (opened in the same moment, the
  // profile would be drawn underneath the Admin page)
  useEffect(() => {
    if (initialOpenUserId) setOpenUserId(initialOpenUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

export const AdminPage: React.FC<{
  /** Your role: admins and super admins both get this page */
  role: Role;
  you: LatLng | null;
  onClose: () => void;
  onShowDriveOnMap: (d: Drive) => void;
  onDirectionsToDrive: (d: Drive) => void;
  onShowTreeOnMap: (t: Tree) => void;
  /** Opened from a notification: start on this tab, with this person's profile (or this place form) open */
  initialTab?: 'users' | 'review' | 'places';
  initialUserId?: string;
  initialFormId?: string;
  /** Called once the starting tab and profile have been used */
  onStarted?: () => void;
}> = ({ role, you, onClose, onShowDriveOnMap, onDirectionsToDrive, onShowTreeOnMap, initialTab, initialUserId, initialFormId, onStarted }) => {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const [startUserId] = useState(initialUserId);
  const [startFormId] = useState(initialFormId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onStarted?.(), []);
  const [drive, setDrive] = useState<Drive | null>(null);
  const [creating, setCreating] = useState(false);
  // What the last schedule or edit told people, shown above the drives
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
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
    <ViewerRoleContext.Provider value={role}>
      <Page title="Admin" onBack={onClose} wide>
        <Chips label="Section" options={tabs} value={tab} onChange={setTab} className="no-scrollbar -mx-4 overflow-x-auto px-4" />
        {tab === 'overview' && <Overview />}
        {tab === 'drives' && (
          <>
          {driveNotice && <Alert tone="success">{driveNotice}</Alert>}
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
          </>
        )}
        {tab === 'trees' && <AdminTrees onShowOnMap={onShowTreeOnMap} />}
        {tab === 'places' && <AdminPlaces initialFormId={startFormId} />}
        {tab === 'media' && <AdminMedia />}
        {tab === 'categories' && <AdminCategories />}
        {tab === 'review' && <AdminReview onReviewed={loadPending} />}
        {tab === 'users' && <UsersList onShowTreeOnMap={onShowTreeOnMap} initialOpenUserId={startUserId} />}
        {tab === 'socials' && <AdminSiteLinks />}
        {tab === 'settings' && <AdminSettings />}
      </Page>

      {drive && (
        <Page title="Drive" onBack={() => setDrive(null)}>
          <DriveView
            drive={drive}
            you={you}
            onShowOnMap={onShowDriveOnMap}
            onDirections={onDirectionsToDrive}
            showVisibility
            onUpdated={(d, notifying) => {
              setDrive(d);
              setRefreshKey((k) => k + 1);
              setDriveNotice(notifyMessage(notifying) ? `Saved. ${notifyMessage(notifying)}` : null);
            }}
            onDeleted={(notifying) => {
              setDrive(null);
              setRefreshKey((k) => k + 1);
              setDriveNotice(`Drive deleted.${notifyMessage(notifying) ? ' ' + notifyMessage(notifying) : ''}`);
            }}
          />
        </Page>
      )}

      {creating && (
        <Page title="Schedule a drive" onBack={() => setCreating(false)}>
          <DriveForm
            you={you}
            onDone={(_drive, notifying) => {
              setCreating(false);
              setRefreshKey((k) => k + 1);
              setDriveNotice(`Drive scheduled.${notifyMessage(notifying) ? ' ' + notifyMessage(notifying) : ''}`);
            }}
          />
        </Page>
      )}
    </ViewerRoleContext.Provider>
  );
};
