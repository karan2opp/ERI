import { MapPin, Plus, Search, X } from 'lucide-react';
import type { Tree, LatLng } from '../../types';
import { useSearch } from '../../lib/search';
import { STATUS_LABEL, isDemoTree, shortSpecies, treeStatus } from '../../lib/trees';
import { formatDistance, getDistanceInMeters } from '../../utils/geo';
import { Chips } from '../ui/chips';
import { StatusDot } from '../ui/badge';
import { Button } from '../ui/button';
import { Alert } from '../ui/alert';
import { Sapling } from '../ui/logo';
import { Spinner } from '../ui/spinner';

export type DistanceFilter = 'ALL' | '100' | '500' | '1000';

const DISTANCES = [
  { value: 'ALL' as const, label: 'Any distance' },
  { value: '100' as const, label: '100 m' },
  { value: '500' as const, label: '500 m' },
  { value: '1000' as const, label: '1 km' },
];

const distanceTo = (you: LatLng | null, t: Tree) => (you ? getDistanceInMeters(you.lat, you.lng, t.latitude, t.longitude) : null);

/** One tree in a list: status dot, name, species and status, distance on the right. */
export const TreeRow: React.FC<{ tree: Tree; you: LatLng | null; onSelect: (tree: Tree) => void }> = ({ tree, you, onSelect }) => {
  const status = treeStatus(tree);
  const meters = distanceTo(you, tree);
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

/** The sheet's resting content: search, distance filter and the trees around you. */
export const NearbyPanel: React.FC<{
  trees: Tree[];
  allTrees: Tree[];
  you: LatLng | null;
  query: string;
  onQueryChange: (q: string) => void;
  onSearchFocus: () => void;
  distance: DistanceFilter;
  onDistanceChange: (d: DistanceFilter) => void;
  onSelectTree: (tree: Tree) => void;
  onSelectPlace: (place: LatLng) => void;
  onPlant: () => void;
}> = ({ trees, allTrees, you, query, onQueryChange, onSearchFocus, distance, onDistanceChange, onSelectTree, onSelectPlace, onPlant }) => {
  const search = useSearch(query, allTrees);

  const sorted = you
    ? [...trees].sort((a, b) => (distanceTo(you, a) ?? 0) - (distanceTo(you, b) ?? 0))
    : [...trees].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const showingDemo = trees.length > 0 && trees.every(isDemoTree);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
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

          {showingDemo && (
            <Alert tone="info" title="These are sample trees">
              Plant the first real tree and it'll show up for everyone.
            </Alert>
          )}

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Sapling />
              <p className="max-w-xs text-muted-foreground">
                {distance !== 'ALL' ? 'No trees this close to you. Try a wider distance.' : 'No trees mapped here yet. Spotted one worth caring for? Add it to the map.'}
              </p>
              <Button size="lg" onClick={onPlant}>
                <Plus aria-hidden="true" /> Plant a tree
              </Button>
            </div>
          ) : (
            <ul className="-mt-2 divide-y divide-border">
              {sorted.slice(0, 40).map((t) => (
                <TreeRow key={t.id} tree={t} you={you} onSelect={onSelectTree} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
