import { useEffect, useState } from 'react';
import { ChevronRight, Info, Mail, Phone } from 'lucide-react';
import type { Tree } from '../types';
import {
  fetchAdminTrees,
  fetchAdminUser,
  fetchAdminUserCare,
  type AdminCareEntry,
  type AdminUserProfile as ProfileData,
  type Paged,
} from '../services/api';
import { formatAgeShort, formatDateTime, treeAge } from '../lib/age';
import { formatPhone } from '../lib/phone';
import { ROLE_LABEL, asRole } from '../lib/roles';
import { CARE_LABEL, STATUS_LABEL, timeAgo, treeStatus } from '../lib/trees';

// timeAgo turns into a plain date after two weeks; the exact date is already shown beside it, so skip the repeat
const agoIfRecent = (iso: string) => {
  const text = timeAgo(iso);
  return /\d{4}$/.test(text) ? null : text;
};
import { cn } from '../lib/cn';
import { Page } from './ui/top-bar';
import { Badge } from './ui/badge';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';
import { Pager } from './ui/pager';
import { RoleSelect } from './RoleSelect';
import { useViewerRole } from '../lib/viewerRole';
import { CARE_ICON } from './TreeLife';
import { TreeHistoryPage } from './AdminTrees';

const PAGE_SIZE = 10;

/** One labelled detail: label above, value below. */
const Detail: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={className}>
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 break-words">{children}</dd>
  </div>
);

/** A big number and its label. */
const Figure: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => (
  <div className="flex flex-col gap-1 rounded-2xl bg-muted p-4">
    <span className="font-heading text-3xl font-bold tabular-nums">{value}</span>
    <span className="text-sm text-muted-foreground">{label}</span>
  </div>
);

/** Loads one server page at a time (page 1, 2, …) of anything. */
function usePage<T>(load: (page: number) => Promise<Paged<T>>, deps: unknown[]) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paged<T> | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => setPage(1), deps);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load(page).then(
      (res) => {
        if (cancelled) return;
        setResult(res);
        setFailed(false);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
    // The loader changes with `deps`; the page changes on its own
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...deps]);

  return { page, setPage, result, failed, loading };
}

/**
 * An admin's view of one user: their details (including phone, which isn't verified), what they've
 * done, the trees they planted and their care activity, each loaded 10 at a time from the server.
 */
export const AdminUserProfile: React.FC<{ userId: string; isSelf: boolean; onClose: () => void; onShowTreeOnMap: (tree: Tree) => void }> = ({
  userId,
  isSelf,
  onClose,
  onShowTreeOnMap,
}) => {
  const viewer = useViewerRole();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [failed, setFailed] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [openTreeId, setOpenTreeId] = useState<string | null>(null);

  useEffect(() => {
    setProfile(null);
    setFailed(false);
    fetchAdminUser(userId).then(setProfile, () => setFailed(true));
  }, [userId]);

  const trees = usePage<Tree>((p) => fetchAdminTrees({ page: p, limit: PAGE_SIZE, userId }), [userId]);
  const care = usePage<AdminCareEntry>((p) => fetchAdminUserCare(userId, p, PAGE_SIZE), [userId]);

  const user = profile?.user;
  const stats = profile?.stats;

  return (
    <>
      <Page title="User profile" onBack={onClose} wide>
        {failed ? (
          <Alert tone="error">Couldn't load this user. Go back and try again.</Alert>
        ) : !user || !stats ? (
          <Spinner label="Loading user" />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <img
                src={user.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.id}`}
                alt=""
                className="size-20 shrink-0 rounded-full bg-muted object-cover"
              />
              <div className="min-w-0">
                <h2 className="truncate text-2xl">
                  {user.name || 'No name'}
                  {isSelf && <span className="ml-2 font-sans text-base font-normal text-muted-foreground">(you)</span>}
                </h2>
                <p className="truncate text-muted-foreground">{user.email}</p>
                <Badge variant={asRole(user.role) === 'USER' ? 'secondary' : 'primary'} className="mt-1.5">
                  {ROLE_LABEL[asRole(user.role)]}
                </Badge>
              </div>
            </div>

            {/* Details, each with its label */}
            <dl className="grid gap-4 rounded-2xl bg-muted p-4 sm:grid-cols-2">
              <Detail label="Phone number">
                {user.phone ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <a href={`tel:${user.phone}`} className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline">
                      <Phone className="size-4" aria-hidden="true" /> {formatPhone(user.phone)}
                    </a>
                    <Badge variant="outline">
                      <Info aria-hidden="true" /> Not verified
                    </Badge>
                  </span>
                ) : (
                  <span className="text-muted-foreground">No phone number added</span>
                )}
              </Detail>
              <Detail label="Email">
                <a href={`mailto:${user.email}`} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
                  <Mail className="size-4 shrink-0" aria-hidden="true" /> {user.email}
                </a>
              </Detail>
              <Detail label="Role">
                <RoleSelect user={user} isSelf={isSelf} onError={setRoleError} />
                {roleError && <p role="alert" className="mt-1 text-sm text-destructive">{roleError}</p>}
              </Detail>
              <Detail label="Joined">{formatDateTime(new Date(user.createdAt))}</Detail>
              <Detail label="Last active">
                {stats.lastActiveAt ? [agoIfRecent(stats.lastActiveAt), formatDateTime(new Date(stats.lastActiveAt))].filter(Boolean).join(' · ') : <span className="text-muted-foreground">No activity yet</span>}
              </Detail>
              {/* The sign-in ID is for super admins only */}
              {viewer === 'SUPER_ADMIN' && (
                <Detail label="User ID">
                  <code className="text-sm break-all text-muted-foreground">{user.id}</code>
                </Detail>
              )}
            </dl>

            <div className="grid grid-cols-2 gap-3">
              <Figure value={stats.treesPlanted} label={stats.treesPlanted === 1 ? 'tree planted' : 'trees planted'} />
              <Figure value={stats.careTotal} label={stats.careTotal === 1 ? 'care action' : 'care actions'} />
            </div>

            {stats.careTotal > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Care actions by type">
                {Object.entries(CARE_LABEL).map(([type, label]) =>
                  stats.careByType[type] ? (
                    <li key={type}>
                      <Badge variant="secondary" className="h-8 gap-1.5 px-3 [&_svg]:size-4">
                        {CARE_ICON[type as keyof typeof CARE_ICON]} {label} · {stats.careByType[type]}
                      </Badge>
                    </li>
                  ) : null
                )}
              </ul>
            )}

            {/* Trees they planted */}
            <section className="flex flex-col gap-3" aria-labelledby="user-trees">
              <h3 id="user-trees" className="text-lg">
                Trees planted
                {trees.result && <span className="ml-2 font-sans text-base font-normal text-muted-foreground">{trees.result.total}</span>}
              </h3>
              {trees.failed ? (
                <Alert tone="error">Couldn't load their trees.</Alert>
              ) : !trees.result ? (
                <Spinner label="Loading trees" />
              ) : trees.result.data.length === 0 ? (
                <p className="text-muted-foreground">This user hasn't planted any trees.</p>
              ) : (
                <ul className={cn('flex flex-col divide-y divide-border transition-opacity', trees.loading && 'opacity-60')} aria-busy={trees.loading}>
                  {trees.result.data.map((t) => {
                    const s = treeStatus(t);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setOpenTreeId(t.id)}
                          className="flex w-full cursor-pointer items-center gap-4 rounded-xl py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <img src={t.photoUrl} alt="" className="size-12 shrink-0 rounded-xl bg-muted object-cover" loading="lazy" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-medium">{t.name}</span>
                              <Badge variant={s} className="shrink-0 max-sm:hidden">{STATUS_LABEL[s]}</Badge>
                            </span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {t.species.split(' (')[0]} · {formatAgeShort(treeAge(new Date(t.plantedAt)))} old
                            </span>
                          </span>
                          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {trees.result && (
                <Pager
                  page={trees.result.page}
                  totalPages={trees.result.totalPages}
                  onPage={trees.setPage}
                  total={trees.result.total}
                  pageSize={PAGE_SIZE}
                  noun={trees.result.total === 1 ? 'tree' : 'trees'}
                />
              )}
            </section>

            {/* Their care activity */}
            <section className="flex flex-col gap-3" aria-labelledby="user-care">
              <h3 id="user-care" className="text-lg">
                Care activity
                {care.result && <span className="ml-2 font-sans text-base font-normal text-muted-foreground">{care.result.total}</span>}
              </h3>
              {care.failed ? (
                <Alert tone="error">Couldn't load their care activity.</Alert>
              ) : !care.result ? (
                <Spinner label="Loading care activity" />
              ) : care.result.data.length === 0 ? (
                <p className="text-muted-foreground">No care logged yet.</p>
              ) : (
                <ul className={cn('flex flex-col divide-y divide-border transition-opacity', care.loading && 'opacity-60')} aria-busy={care.loading}>
                  {care.result.data.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setOpenTreeId(c.treeId)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary [&>svg]:size-4">
                          {CARE_ICON[c.actionType] ?? CARE_ICON.INSPECTED}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {CARE_LABEL[c.actionType] ?? c.actionType} · {c.treeName}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {[formatDateTime(new Date(c.performedAt)), agoIfRecent(c.performedAt)].filter(Boolean).join(' · ')}
                          </span>
                          {c.notes && <span className="mt-0.5 block truncate text-sm">{c.notes}</span>}
                        </span>
                        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {care.result && (
                <Pager
                  page={care.result.page}
                  totalPages={care.result.totalPages}
                  onPage={care.setPage}
                  total={care.result.total}
                  pageSize={PAGE_SIZE}
                  noun={care.result.total === 1 ? 'action' : 'actions'}
                />
              )}
            </section>
          </>
        )}
      </Page>

      {openTreeId && <TreeHistoryPage treeId={openTreeId} onClose={() => setOpenTreeId(null)} onShowOnMap={onShowTreeOnMap} />}
    </>
  );
};
