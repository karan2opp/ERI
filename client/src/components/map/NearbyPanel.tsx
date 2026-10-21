import { useEffect, useState } from 'react';
import { MapPin, Plus, Search, X } from 'lucide-react';
import type { Tree, LatLng } from '../../types';
import { useSearch } from '../../lib/search';
import { browseTrees, type Paged } from '../../services/api';
import { cn } from '../../lib/cn';
import { Pager } from '../ui/pager';
import { STATUS_LABEL, shortSpecies, treeStatus } from '../../lib/trees';
import { formatDistance, getDistanceInMeters } from '../../utils/geo';
import { Chips } from '../ui/chips';
import { StatusDot } from '../ui/badge';
import { Button } from '../ui/button';
import { Alert } from '../ui/alert';
import { Sapling } from '../ui/logo';
import { Spinner } from '../ui/spinner';

export type DistanceFilter = 'ALL' | '100' | '500' | '1000';
export type StatusFilter = 'ALL' | 'THIRSTY' | 'HEALTHY' | 'MINE';

const PAGE_SIZE = 10;

const DISTANCES = [
  { value: 'ALL' as const, label: 'Any distance' },
  { value: '100' as const, label: '100 m' },
  { value: '500' as const, label: '500 m' },
  { value: '1000' as const, label: '1 km' },
];

const distanceTo = (you: LatLng | null, t: Tree) => (you ? getDistanceInMeters(you.lat, you.lng, t.latitude, t.longitude) : null);

/** One tree in a list: status dot, name, species and status, distance on the right. */
export const TreeRow: React.FC<{ tree: Tree & { distance?: number }; you: LatLng | null; onSelect: (tree: Tree) => void }> = ({ tree, you, onSelect }) => {
  const status = treeStatus(tree);
  // The server works out the distance for listed trees; trees from the map are measured here
  const meters = tree.distance ?? distanceTo(you, tree);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(tree)}
        className="flex w-full cursor-pointer items-center gap-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        <StatusDot status={status} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-medium">{tree.name}</span>
          <span className="block truncate text-muted-foreground">
            {shortSpecies(tree.species)} · {STATUS_LABEL[status]}
          </span>
        </span>
        {meters !== null && <span className="shrink-0 text-lg tabular-nums">{formatDistance(meters)}</span>}
      </button>
    </li>
  );
};

/**
 * The sheet's resting content: search, distance filter and the trees around you, 10 at a time.
 * The server filters, sorts (nearest first) and pages the list; the browser only shows one page.
 */
export const NearbyPanel: React.FC<{
  you: LatLng | null;
  status: StatusFilter;
  query: string;
  onQueryChange: (q: string) => void;
  onSearchFocus: () => void;
  distance: DistanceFilter;
  onDistanceChange: (d: DistanceFilter) => void;
  onSelectTree: (tree: Tree) => void;
  onSelectPlace: (place: LatLng) => void;
  onPlant: () => void;
  /** Bump to reload (after planting, caring, editing or removing a tree) */
  refreshKey: number;
  /** Reports how many trees match, for the header */
  onTotal: (total: number | null) => void;
}> = ({ you, status, query, onQueryChange, onSearchFocus, distance, onDistanceChange, onSelectTree, onSelectPlace, onPlant, refreshKey, onTotal }) => {
  const search = useSearch(query, you);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paged<Tree & { distance?: number }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Only the rough area (about 100 m) matters, so GPS jitter doesn't reload the list
  const area = you ? `${you.lat.toFixed(3)},${you.lng.toFixed(3)}` : '';
  const radius = distance === 'ALL' ? null : Number(distance);

  // A new filter starts again from page 1
  useEffect(() => setPage(1), [status, distance, area]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    browseTrees({
      page,
      limit: PAGE_SIZE,
      near: you,
      radius,
      status: status === 'THIRSTY' ? 'thirsty' : status === 'HEALTHY' ? 'healthy' : 'all',
      mine: status === 'MINE',
    }).then(
      (res) => {
        if (cancelled) return;
        setResult(res);
        setFailed(false);
        setLoading(false);
        onTotal(res.total);
      },
      () => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
        onTotal(null);
      }
    );
    return () => {
      cancelled = true;
    };
    // `you` is represented by `area`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, radius, area, refreshKey]);

  const rows = result?.data ?? [];

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id="tree-search"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={onSearchFocus}
          placeholder="Search trees or places"
          aria-label="Search trees or places"
          className="h-12 w-full rounded-full bg-input pr-12 pl-12 text-base outline-none placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {search.active ? (
        <div className="flex flex-col gap-2">
          {search.trees.length > 0 && (
            <>
              <h3 className="font-sans text-sm font-medium text-muted-foreground">Trees</h3>
              <ul className="divide-y divide-border">
                {search.trees.map((t) => (
                  <TreeRow key={t.id} tree={t} you={you} onSelect={onSelectTree} />
                ))}
              </ul>
            </>
          )}
          <h3 className="flex items-center gap-2 font-sans text-sm font-medium text-muted-foreground">
            Places {search.loading && <Spinner className="size-4" label="Searching places" />}
          </h3>
          {search.places.length > 0 ? (
            <ul className="divide-y divide-border">
              {search.places.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPlace({ lat: p.lat, lng: p.lng })}
                    className="flex w-full cursor-pointer items-center gap-4 rounded-lg py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{p.address}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !search.loading && (
              <p className="py-2 text-muted-foreground">
                {search.trees.length ? 'No places match that.' : `Nothing matches "${query.trim()}". Try a street, area or tree name.`}
              </p>
            )
          )}
        </div>
      ) : (
        <>
          {you && (
            <Chips label="Distance from you" options={DISTANCES} value={distance} onChange={onDistanceChange} className="no-scrollbar -mx-5 overflow-x-auto px-5" />
          )}

          {failed ? (
            <Alert tone="error">Couldn't load trees. Check your connection and try again.</Alert>
          ) : loading && !result ? (
            <Spinner label="Loading trees" />
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Sapling />
              <p className="max-w-xs text-muted-foreground">
                {status === 'MINE'
                  ? "You haven't planted any trees yet."
                  : status !== 'ALL'
                    ? 'No trees match this filter.'
                    : distance !== 'ALL'
                      ? 'No trees this close to you. Try a wider distance.'
                      : 'No trees mapped here yet. Spotted one worth caring for? Add it to the map.'}
              </p>
              <Button size="lg" onClick={onPlant}>
                <Plus aria-hidden="true" /> Plant a tree
              </Button>
            </div>
          ) : (
            <>
              <ul className={cn('-mt-2 divide-y divide-border transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
                {rows.map((t) => (
                  <TreeRow key={t.id} tree={t} you={you} onSelect={onSelectTree} />
                ))}
              </ul>
              {result && (
                <Pager
                  page={result.page}
                  totalPages={result.totalPages}
                  onPage={setPage}
                  alwaysShow
                  total={result.total}
                  pageSize={PAGE_SIZE}
                  noun={result.total === 1 ? 'tree' : 'trees'}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
