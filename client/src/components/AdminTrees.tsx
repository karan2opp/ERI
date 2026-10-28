import { useEffect, useState } from 'react';
import { ChevronRight, ExternalLink, Map as MapIcon, MapPin, Search, X } from 'lucide-react';
import type { CareLog, Tree } from '../types';
import { fetchAdminTrees, fetchTreeById, type TreeDateField } from '../services/api';
import { formatAgeShort, formatDateTime, treeAge } from '../lib/age';
import { STATUS_LABEL, timeAgo, treeStatus } from '../lib/trees';
import { cn } from '../lib/cn';
import { Page } from './ui/top-bar';
import { Badge } from './ui/badge';
import { Button, buttonClass } from './ui/button';
import { Chips } from './ui/chips';
import { Field, Input } from './ui/field';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';
import { Pager } from './ui/pager';
import { ExpandableText } from './ui/expandable-text';
import { CareSchedule, CareSummary, CareTimeline, TreeAge, useCareHistory } from './TreeLife';

type Status = 'all' | 'thirsty' | 'fertilize' | 'weed' | 'healthy';

const DATE_FIELDS: { value: TreeDateField; label: string }[] = [
  { value: 'planted', label: 'Planted' },
  { value: 'watered', label: 'Last watered' },
  { value: 'cared', label: 'Last cared for' },
];

const STATUSES: { value: Status; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'thirsty', label: 'Needs water' },
  { value: 'fertilize', label: 'Needs fertiliser' },
  { value: 'weed', label: 'Needs grass removal' },
  { value: 'healthy', label: 'Healthy' },
];

const PAGE_SIZE = 10;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dayLabel = (day: string) => new Date(`${day}T00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** One tree's full record for admins: details, age from planting, last watered/cared and every care entry. */
export const TreeHistoryPage: React.FC<{ treeId: string; onClose: () => void; onShowOnMap: (tree: Tree) => void }> = ({ treeId, onClose, onShowOnMap }) => {
  const [tree, setTree] = useState<(Tree & { careLogs?: CareLog[] }) | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchTreeById(treeId).then(setTree, () => setFailed(true));
  }, [treeId]);

  // The full history, 10 entries at a time from the server
  const care = useCareHistory(treeId);
  const history = care.items;
  const status = tree ? treeStatus(tree) : null;

  return (
    <Page title="Tree history" onBack={onClose}>
      {failed ? (
        <Alert tone="error">Couldn't load this tree. Go back and try again.</Alert>
      ) : !tree ? (
        <Spinner label="Loading tree" />
      ) : (
        <>
          <div className="flex gap-4">
            <img src={tree.photoUrl} alt={`Photo of ${tree.name}`} className="size-24 shrink-0 rounded-xl bg-muted object-cover" />
            <div className="flex min-w-0 flex-col justify-center gap-1.5">
              <h2 className="text-xl leading-tight">{tree.name}</h2>
              <p className="truncate text-muted-foreground">{tree.species}</p>
              <div className="flex flex-wrap gap-1.5">
                {status && <Badge variant={status}>{STATUS_LABEL[status]}</Badge>}
                <Badge variant="secondary">Health {tree.healthScore}%</Badge>
              </div>
            </div>
          </div>

          {/* Where it is: on our map (closes Admin and opens the tree there) or in Google Maps */}
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={() => onShowOnMap(tree)}>
              <MapIcon aria-hidden="true" /> Show on our map
            </Button>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${tree.latitude},${tree.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('secondary', 'lg')}
            >
              <ExternalLink aria-hidden="true" /> Google Maps
            </a>
          </div>

          <TreeAge plantedAt={tree.plantedAt} />
          <CareSummary tree={tree} history={history} />
          <CareSchedule tree={tree} />

          <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Planted by</dt>
              <dd>{tree.owner?.name || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Added to the map</dt>
              <dd>{formatDateTime(new Date(tree.createdAt))}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-muted-foreground">Where</dt>
              <dd className="flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {tree.address || `${tree.latitude.toFixed(5)}, ${tree.longitude.toFixed(5)}`}
              </dd>
            </div>
          </dl>
          {tree.description && <ExpandableText text={tree.description} />}

          <section className="flex flex-col gap-3" aria-labelledby="admin-history">
            <h3 id="admin-history" className="text-lg">
              Care history
              {care.items && <span className="ml-2 font-sans text-base font-normal text-muted-foreground">{care.total}</span>}
            </h3>
            {history && history.length > 0 ? (
              <CareTimeline
                history={history}
                total={care.total}
                onLoadMore={care.loadMore}
                loadingMore={care.loadingMore}
                treePhotoUrl={tree.photoUrl}
                photoEditor={{ treeId: tree.id, onChanged: care.reload }}
              />
            ) : (
              <p className="text-muted-foreground">No care logged yet.</p>
            )}
          </section>
        </>
      )}
    </Page>
  );
};

/**
 * Admin > Trees: search by name, kind or address; filter by a date range on when trees were
 * planted, last watered or last cared for; filter by needs water / healthy; page through results;
 * open any tree for its full history.
 */
export const AdminTrees: React.FC<{ onShowOnMap: (tree: Tree) => void }> = ({ onShowOnMap }) => {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [dateField, setDateField] = useState<TreeDateField>('planted');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchAdminTrees>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // A backwards range (from after to) would match nothing; say so instead of searching
  const badRange = Boolean(from && to && from > to);

  useEffect(() => {
    if (badRange) return;
    let cancelled = false;
    setLoading(true);
    fetchAdminTrees({ page, limit: PAGE_SIZE, search, dateField, from, to, status }).then(
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
  }, [page, search, dateField, from, to, status, badRange]);

  // Changing a filter starts again from page 1
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const filtersOn = Boolean(search || from || to || status !== 'all');
  const clearAll = () => {
    setQuery('');
    setFrom('');
    setTo('');
    setStatus('all');
    setPage(1);
  };
  const fieldLabel = DATE_FIELDS.find((d) => d.value === dateField)!.label.toLowerCase();

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, kind or address"
            aria-label="Search trees by name, kind or address"
            className="h-12 w-full rounded-full bg-input pr-4 pl-12 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
        </div>

        <Chips label="Status" options={STATUSES} value={status} onChange={reset(setStatus)} size="sm" />

        {/* Date search: which date, then a range */}
        <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
          <Field label="Search by date">
            <Chips label="Which date" options={DATE_FIELDS} value={dateField} onChange={reset(setDateField)} size="sm" className="flex-wrap" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="trees-from">
              <Input id="trees-from" type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} className="bg-card" />
            </Field>
            <Field label="To" htmlFor="trees-to">
              <Input id="trees-to" type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} className="bg-card" />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            {from || to
              ? `Trees ${fieldLabel} ${from ? `from ${dayLabel(from)} ` : ''}${to ? `until the end of ${dayLabel(to)}` : 'onwards'}. Pick the same day in both for one day.`
              : 'Leave both empty for any date. Pick the same day in both to see one day.'}
          </p>
        </div>

        {badRange && <Alert tone="error">"From" is after "To". Swap them to search that range.</Alert>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground" aria-live="polite">
            {result ? `${result.total} ${result.total === 1 ? 'tree' : 'trees'}, newest ${fieldLabel} first` : ' '}
          </p>
          {filtersOn && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X aria-hidden="true" /> Clear filters
            </Button>
          )}
        </div>

        {failed ? (
          <Alert tone="error">Couldn't load trees. Refresh to try again.</Alert>
        ) : !result ? (
          <Spinner label="Loading trees" />
        ) : result.data.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No trees match these filters.</p>
        ) : (
          <ul className={cn('flex flex-col divide-y divide-border transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
            {result.data.map((t) => {
              const s = treeStatus(t);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(t.id)}
                    className="flex w-full cursor-pointer items-center gap-4 rounded-xl py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <img src={t.photoUrl} alt="" className="size-14 shrink-0 rounded-xl bg-muted object-cover" loading="lazy" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{t.name}</span>
                        <Badge variant={s} className="shrink-0 max-sm:hidden">{STATUS_LABEL[s]}</Badge>
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {t.species.split(' (')[0]}
                        {t.ownerName ? ` · by ${t.ownerName}` : ''}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        Planted {shortDate(t.plantedAt)} ({formatAgeShort(treeAge(new Date(t.plantedAt)))} old) · watered{' '}
                        {t.lastWateredAt ? timeAgo(t.lastWateredAt) : 'never'} · cared {t.lastCaredAt ? timeAgo(t.lastCaredAt) : 'never'}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {result && <Pager page={result.page} totalPages={result.totalPages} onPage={setPage} />}
      </div>

      {openId && <TreeHistoryPage treeId={openId} onClose={() => setOpenId(null)} onShowOnMap={onShowOnMap} />}
    </>
  );
};
