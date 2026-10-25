import { useEffect, useState } from 'react';
import { Droplets, Pencil, Plus, Search } from 'lucide-react';
import type { LatLng, Role, Tree } from '../types';
import { careLock } from '../lib/schedule';
import { browseTrees, type Paged, type TreeSort } from '../services/api';
import { logCareActivity } from '../services/photoApi';
import { STATUS_LABEL, isPending, timeAgo, treeStatus } from '../lib/trees';
import { formatAgeShort, treeAge } from '../lib/age';
import { formatDistance } from '../utils/geo';
import { cn } from '../lib/cn';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Chips } from '../components/ui/chips';
import { Alert } from '../components/ui/alert';
import { Sapling } from '../components/ui/logo';
import { Spinner } from '../components/ui/spinner';
import { Pager } from '../components/ui/pager';

type Sort = 'NEWEST' | 'THIRSTY' | 'NEAREST';

const PAGE_SIZE = 10;
const SORT_PARAM: Record<Sort, TreeSort> = { NEWEST: 'newest', THIRSTY: 'thirsty', NEAREST: 'nearest' };

/** Big number and a label, for the stats row. */
export const Stat: React.FC<{ value: React.ReactNode; label: string; tone?: 'thirsty' }> = ({ value, label, tone }) => (
  <div className={`flex flex-col gap-1 rounded-2xl p-4 ${tone === 'thirsty' ? 'bg-thirsty/12' : 'bg-muted'}`}>
    <span className="font-heading text-4xl font-bold tabular-nums">{value}</span>
    <span className="text-muted-foreground">{label}</span>
  </div>
);

/**
 * The trees you planted, 10 at a time from the server: search, sort (newest, needs water first,
 * nearest) and page through them, and water any of them in one tap.
 */
export const MyTreesPage: React.FC<{
  you: LatLng | null;
  onClose: () => void;
  onShowOnMap: (tree: Tree) => void;
  onPlant: () => void;
  onChanged: () => void;
  /** Admins can water at any time; everyone else from a day before it's due */
  role: Role;
  /** Opens the edit screen for one of your trees */
  onEdit: (tree: Tree) => void;
  /** Changes when something outside this page changed a tree (an edit), so the list reloads */
  refreshKey?: number;
}> = ({ you, onClose, onShowOnMap, onPlant, onChanged, role, onEdit, refreshKey = 0 }) => {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('NEWEST');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<(Paged<Tree & { distance?: number }> & { summary?: { total: number; thirsty: number } }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [watering, setWatering] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // Wait until typing pauses before searching; a new search or sort starts from page 1
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setPage(1), [search, sort]);

  const area = you ? `${you.lat.toFixed(3)},${you.lng.toFixed(3)}` : '';
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    browseTrees({ page, limit: PAGE_SIZE, mine: true, search, sort: SORT_PARAM[sort], near: you }).then(
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
    // `you` is represented by `area`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, sort, area, version, refreshKey]);

  const planted = result?.summary?.total ?? 0;
  const thirsty = result?.summary?.thirsty ?? 0;

  const water = async (tree: Tree) => {
    setWatering(tree.id);
    setNotice(null);
    try {
      await logCareActivity(tree.id, { actionType: 'WATERED' });
      setNotice({ tone: 'success', text: `${tree.name} watered.` });
      setVersion((v) => v + 1);
      onChanged();
    } catch (err) {
      // The server says why (for example, it isn't open yet)
      const why = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNotice({ tone: 'error', text: why || `Couldn't log watering for ${tree.name}. Try again.` });
      setVersion((v) => v + 1);
    } finally {
      setWatering(null);
    }
  };

  const sorts = [
    { value: 'NEWEST' as const, label: 'Newest' },
    { value: 'THIRSTY' as const, label: 'Needs water first' },
    ...(you ? [{ value: 'NEAREST' as const, label: 'Nearest' }] : []),
  ];

  return (
    <Page
      title="My trees"
      onBack={onClose}
      action={
        <Button size="default" onClick={onPlant}>
          <Plus aria-hidden="true" /> Plant
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat value={result ? planted : '–'} label={planted === 1 ? 'tree planted' : 'trees planted'} />
        <Stat value={thirsty} label="need water" tone={thirsty ? 'thirsty' : undefined} />
      </div>

      {failed ? (
        <Alert tone="error">Couldn't load your trees. Check your connection and try again.</Alert>
      ) : !result ? (
        <Spinner label="Loading your trees" />
      ) : planted === 0 ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <Sapling className="h-28" />
          <h2 className="text-2xl">Your grove starts here</h2>
          <p className="max-w-xs text-muted-foreground">Trees you plant show up here so you can keep them watered.</p>
          <Button size="xl" onClick={onPlant}>
            <Plus aria-hidden="true" /> Plant your first tree
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your trees"
              aria-label="Search your trees"
              className="h-12 w-full rounded-full bg-input pr-4 pl-12 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Chips label="Sort" options={sorts} value={sort} onChange={setSort} className="no-scrollbar -mx-4 overflow-x-auto px-4" />

          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

          {result.data.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">None of your trees match "{search}".</p>
          ) : (
            <ul className={cn('flex flex-col divide-y divide-border transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
              {result.data.map((t) => {
                const status = treeStatus(t);
                // Waiting for an admin to check the photo: not on the map yet, so no watering or "show on map"
                if (isPending(t)) {
                  return (
                    <li key={t.id} className="flex items-center gap-4 py-4">
                      <img src={t.photoUrl} alt="" className="size-16 shrink-0 rounded-xl bg-muted object-cover" loading="lazy" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-medium">{t.name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <Badge variant="outline">Awaiting review</Badge>
                          An admin is checking the photo. It goes on the map once approved.
                        </span>
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => onEdit(t)} aria-label={`Edit ${t.name}`}>
                        <Pencil className="size-4" aria-hidden="true" /> Edit
                      </Button>
                    </li>
                  );
                }
                return (
                  <li key={t.id} className="flex items-center gap-4 py-4">
                    <button type="button" onClick={() => onShowOnMap(t)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <img src={t.photoUrl} alt="" className="size-16 shrink-0 rounded-xl bg-muted object-cover" loading="lazy" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-medium">{t.name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <Badge variant={status}>{STATUS_LABEL[status]}</Badge>
                          {formatAgeShort(treeAge(new Date(t.plantedAt)))} old ·{' '}
                          {t.lastWateredAt ? `watered ${timeAgo(t.lastWateredAt)}` : 'never watered'}
                          {t.distance !== undefined && ` · ${formatDistance(t.distance)}`}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {(() => {
                        const lock = careLock(t, 'WATERED', role);
                        return (
                          <Button
                            variant={status === 'thirsty' ? 'default' : 'secondary'}
                            onClick={() => water(t)}
                            disabled={watering === t.id || lock.locked}
                            aria-label={lock.locked ? `${t.name}: ${lock.text}` : `Mark ${t.name} as watered`}
                            title={lock.text ?? undefined}
                          >
                            {watering === t.id ? <Spinner className="size-4" /> : <Droplets aria-hidden="true" />}
                            {lock.locked ? `Water ${lock.short}` : 'Water'}
                          </Button>
                        );
                      })()}
                      <Button variant="ghost" size="sm" onClick={() => onEdit(t)} aria-label={`Edit ${t.name}`} title="Edit this tree">
                        <Pencil className="size-4" aria-hidden="true" /> Edit
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager
            page={result.page}
            totalPages={result.totalPages}
            onPage={setPage}
            alwaysShow
            total={result.total}
            pageSize={PAGE_SIZE}
            noun={result.total === 1 ? 'tree' : 'trees'}
          />
        </>
      )}
    </Page>
  );
};
