import { useState } from 'react';
import { Droplets, Plus, Search } from 'lucide-react';
import type { LatLng, Tree } from '../types';
import { logCareActivity } from '../services/api';
import { STATUS_LABEL, isDemoTree, timeAgo, treeStatus } from '../lib/trees';
import { formatDistance, getDistanceInMeters } from '../utils/geo';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Chips } from '../components/ui/chips';
import { Alert } from '../components/ui/alert';
import { Sapling } from '../components/ui/logo';
import { Spinner } from '../components/ui/spinner';

type Sort = 'NEWEST' | 'THIRSTY' | 'NEAREST';

/** Big number and a label, for the stats row. */
export const Stat: React.FC<{ value: React.ReactNode; label: string; tone?: 'thirsty' }> = ({ value, label, tone }) => (
  <div className={`flex flex-col gap-1 rounded-2xl p-4 ${tone === 'thirsty' ? 'bg-thirsty/12' : 'bg-muted'}`}>
    <span className="font-heading text-4xl font-bold tabular-nums">{value}</span>
    <span className="text-muted-foreground">{label}</span>
  </div>
);

export const MyTreesPage: React.FC<{
  trees: Tree[];
  userId: string | null;
  you: LatLng | null;
  onClose: () => void;
  onShowOnMap: (tree: Tree) => void;
  onPlant: () => void;
  onChanged: () => void;
}> = ({ trees, userId, you, onClose, onShowOnMap, onPlant, onChanged }) => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('NEWEST');
  const [watering, setWatering] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const mine = trees.filter((t) => userId && !isDemoTree(t) && (t.userId === userId || t.owner?.id === userId));
  const thirsty = mine.filter((t) => treeStatus(t) === 'thirsty').length;
  const q = query.trim().toLowerCase();
  const distance = (t: Tree) => (you ? getDistanceInMeters(you.lat, you.lng, t.latitude, t.longitude) : 0);

  const shown = mine
    .filter((t) => !q || t.name.toLowerCase().includes(q) || t.species.toLowerCase().includes(q) || t.address?.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === 'THIRSTY') return new Date(a.lastWateredAt ?? 0).getTime() - new Date(b.lastWateredAt ?? 0).getTime();
      if (sort === 'NEAREST') return distance(a) - distance(b);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const water = async (tree: Tree) => {
    setWatering(tree.id);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('actionType', 'WATERED');
      await logCareActivity(tree.id, form);
      setNotice({ tone: 'success', text: `${tree.name} watered.` });
      onChanged();
    } catch {
      setNotice({ tone: 'error', text: `Couldn't log watering for ${tree.name}. Try again.` });
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
        <Stat value={mine.length} label={mine.length === 1 ? 'tree planted' : 'trees planted'} />
        <Stat value={thirsty} label="need water" tone={thirsty ? 'thirsty' : undefined} />
      </div>

      {mine.length === 0 ? (
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

          {shown.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">None of your trees match "{query.trim()}".</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {shown.map((t) => {
                const status = treeStatus(t);
                return (
                  <li key={t.id} className="flex items-center gap-4 py-4">
                    <button type="button" onClick={() => onShowOnMap(t)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <img src={t.photoUrl} alt="" className="size-16 shrink-0 rounded-xl bg-muted object-cover" loading="lazy" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-medium">{t.name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <Badge variant={status}>{STATUS_LABEL[status]}</Badge>
                          {t.lastWateredAt ? `Watered ${timeAgo(t.lastWateredAt)}` : 'Never watered'}
                          {you && ` · ${formatDistance(distance(t))}`}
                        </span>
                      </span>
                    </button>
                    <Button variant={status === 'thirsty' ? 'default' : 'secondary'} onClick={() => water(t)} disabled={watering === t.id} aria-label={`Mark ${t.name} as watered`}>
                      {watering === t.id ? <Spinner className="size-4" /> : <Droplets aria-hidden="true" />}
                      Water
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Page>
  );
};
