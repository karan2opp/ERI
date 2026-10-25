import { useEffect, useState } from 'react';
import { Camera, Droplets, HeartHandshake, Scissors, Search, Shovel, Sprout, Trash2 } from 'lucide-react';
import type { CareLog, Tree } from '../types';
import { formatAge, formatDateTime, treeAge, useNow } from '../lib/age';
import { CARE_LABEL, timeAgo, type CareAction } from '../lib/trees';
import { fetchCareHistory, removeCarePhoto } from '../services/api';
import { replaceCarePhoto } from '../services/photoApi';
import { careDue, dueText, everyText, type TaskKind } from '../lib/schedule';
import { Button } from './ui/button';
import { Alert } from './ui/alert';
import { ConfirmDialog } from './ui/confirm-dialog';
import { CameraCapture } from './CameraCapture';
import { cn } from '../lib/cn';

export const CARE_ICON: Record<CareAction, React.ReactNode> = {
  WATERED: <Droplets className="text-water" aria-hidden="true" />,
  FERTILIZED: <Sprout className="text-leaf" aria-hidden="true" />,
  WEEDED: <Shovel className="text-bark" aria-hidden="true" />,
  PRUNED: <Scissors className="text-bark" aria-hidden="true" />,
  INSPECTED: <Search className="text-muted-foreground" aria-hidden="true" />,
};

/**
 * A tree's age, counted like a birthday from the moment it was planted, ticking every minute:
 * "2 years, 3 months, 5 days" with the hours and minutes, and the exact planting date and time.
 */
export const TreeAge: React.FC<{ plantedAt: string; className?: string }> = ({ plantedAt, className }) => {
  const now = useNow();
  const planted = new Date(plantedAt);
  const age = treeAge(planted, now);
  const bigUnits = age.years || age.months || age.days;

  return (
    <section className={cn('flex flex-col gap-3 rounded-2xl bg-muted p-4', className)} aria-labelledby="tree-age">
      <div>
        <h3 id="tree-age" className="font-sans text-sm font-medium text-muted-foreground">Age</h3>
        <p className="font-heading text-2xl font-bold">{formatAge(age)}</p>
        {bigUnits > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="off">
            and {age.hours} h {age.minutes} min · {age.totalDays.toLocaleString('en-IN')} {age.totalDays === 1 ? 'day' : 'days'} in all
          </p>
        )}
      </div>
      <p className="text-[15px]">
        <span className="text-muted-foreground">Planted </span>
        {formatDateTime(planted)}
      </p>
    </section>
  );
};

/** Last watered and last cared for, each with how long ago and the exact date and time. */
export const CareSummary: React.FC<{ tree: Tree; history: CareLog[] | null }> = ({ tree, history }) => {
  useNow(); // keep the "… ago" text fresh
  const lastCare = history?.[0] ?? null; // history is newest first
  const lastCaredAt = lastCare?.performedAt ?? tree.lastCaredAt ?? null;

  const Item: React.FC<{ icon: React.ReactNode; label: string; at: string | null | undefined; detail?: string }> = ({ icon, label, at, detail }) => (
    <div className="flex gap-3 rounded-2xl bg-muted p-3.5">
      <span className="mt-0.5 shrink-0 [&>svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {at ? (
          <>
            <p className="font-medium">
              {detail ? `${detail}, ` : ''}
              {timeAgo(at)}
            </p>
            <p className="text-sm text-muted-foreground">{formatDateTime(new Date(at))}</p>
          </>
        ) : (
          <p className="font-medium">Not yet</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Item icon={<Droplets className="text-water" />} label="Last watered" at={tree.lastWateredAt} />
      <Item
        icon={<HeartHandshake className="text-leaf" />}
        label="Last cared for"
        at={lastCaredAt}
        detail={lastCare ? CARE_LABEL[lastCare.actionType] ?? lastCare.actionType : undefined}
      />
    </div>
  );
};

const TASK_ICON: Record<TaskKind, React.ReactNode> = {
  water: <Droplets className="text-water" aria-hidden="true" />,
  fertilize: <Sprout className="text-leaf" aria-hidden="true" />,
  weed: <Shovel className="text-bark" aria-hidden="true" />,
};

/**
 * The tree's care schedule: for each recurring task (water, fertilise, remove grass) how often it's
 * needed, when it was last done, and when it's next due (or how overdue it is).
 */
export const CareSchedule: React.FC<{ tree: Tree }> = ({ tree }) => {
  useNow(); // keep "due in N days" fresh
  const tasks = careDue(tree);
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`care-schedule-${tree.id}`}>
      <h3 id={`care-schedule-${tree.id}`} className="text-lg">Care schedule</h3>
      <ul className="flex flex-col divide-y divide-border rounded-2xl bg-muted">
        {tasks.map((t) => (
          <li key={t.kind} className="flex items-center gap-3 px-4 py-3">
            <span className="shrink-0 [&>svg]:size-5">{TASK_ICON[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.label}</p>
              <p className="text-sm text-muted-foreground">
                {everyText(t.everyDays)} · {t.lastDoneAt ? `last done ${timeAgo(t.lastDoneAt)}` : 'not done yet'}
              </p>
            </div>
            <p className={cn('shrink-0 text-right text-[15px] font-medium', t.overdue ? 'text-destructive' : t.daysUntil <= 1 ? 'text-foreground' : 'text-muted-foreground')}>
              {dueText(t)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
};

const HISTORY_PAGE = 10;

/**
 * The photo on a care entry. The tree's owner and admins (`editor`) can retake it with the camera or remove it;
 * the server checks that too.
 */
const CarePhoto: React.FC<{ log: CareLog; editor?: { treeId: string; onChanged: () => void } }> = ({ log, editor }) => {
  const [camera, setCamera] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      editor?.onChanged();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <img src={log.photoUrl} alt="Care update" className="h-32 w-full rounded-xl object-cover" loading="lazy" />
      {editor && (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCamera(true)} disabled={busy}>
            <Camera aria-hidden="true" /> Retake photo
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirming(true)} disabled={busy}>
            <Trash2 aria-hidden="true" /> Remove photo
          </Button>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {camera && editor && (
        <CameraCapture
          label="Retake the care photo"
          hint="This replaces the photo on this entry"
          onCapture={(photo) => {
            setCamera(false);
            run(() => replaceCarePhoto(editor.treeId, log.id, photo), "Couldn't replace the photo. Try again.");
          }}
          onClose={() => setCamera(false)}
        />
      )}
      <ConfirmDialog
        open={confirming}
        title="Remove this photo?"
        description="The photo is deleted. The care entry stays in the history."
        confirmLabel="Remove photo"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          if (editor) run(() => removeCarePhoto(editor.treeId, log.id), "Couldn't remove the photo. Try again.");
        }}
      />
    </div>
  );
};

/**
 * Care entries, newest first: what was done, by whom, when (exact date and time), notes and photo.
 * Shows what's been loaded; "Show older entries" loads the next page from the server.
 * With `photoEditor` (the tree's owner or an admin) each entry's photo can be retaken or removed.
 */
export const CareTimeline: React.FC<{
  history: CareLog[];
  total: number;
  onLoadMore: () => void;
  loadingMore?: boolean;
  treePhotoUrl?: string;
  photoEditor?: { treeId: string; onChanged: () => void };
}> = ({ history, total, onLoadMore, loadingMore, treePhotoUrl, photoEditor }) => (
  <>
    <ol className="flex flex-col">
      {history.map((log, i) => (
        <li key={log.id} className="relative flex gap-3 pb-5 last:pb-0">
          {/* The line linking entries, like rings in a trunk */}
          {i < history.length - 1 && <span className="absolute top-9 bottom-0 left-[17px] w-0.5 bg-border" aria-hidden="true" />}
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary [&>svg]:size-4">
            {CARE_ICON[log.actionType] ?? CARE_ICON.INSPECTED}
          </span>
          <div className="min-w-0 flex-1 pt-1.5">
            <p className="font-medium">
              {CARE_LABEL[log.actionType] ?? log.actionType}
              <span className="font-normal text-muted-foreground"> · {timeAgo(log.performedAt)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(new Date(log.performedAt))} · by {log.performer?.name || 'a neighbour'}
            </p>
            {log.notes && <p className="mt-1">{log.notes}</p>}
            {/* The planting entry shows the tree's own photo, which is changed by editing the tree */}
            {log.photoUrl && log.photoUrl !== treePhotoUrl && <CarePhoto log={log} editor={photoEditor} />}
          </div>
        </li>
      ))}
    </ol>
    {total > history.length && (
      <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore} className="self-start">
        {loadingMore ? 'Loading…' : `Show older entries (${total - history.length} more)`}
      </Button>
    )}
  </>
);

/**
 * A tree's care history, loaded from the server 10 entries at a time (newest first).
 * `loadMore` fetches the next page; `reload` starts again (after logging care).
 */
export function useCareHistory(treeId: string | null) {
  const [items, setItems] = useState<CareLog[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!treeId) {
      setItems([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setItems(null);
    setPage(1);
    fetchCareHistory(treeId, 1, HISTORY_PAGE).then(
      (res) => {
        if (cancelled) return;
        setItems(res.data);
        setTotal(res.total);
      },
      () => !cancelled && setItems([])
    );
    return () => {
      cancelled = true;
    };
  }, [treeId, version]);

  const loadMore = async () => {
    if (!treeId || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchCareHistory(treeId, page + 1, HISTORY_PAGE);
      setItems((prev) => [...(prev ?? []), ...res.data]);
      setTotal(res.total);
      setPage(page + 1);
    } finally {
      setLoadingMore(false);
    }
  };

  return { items, total, loadMore, loadingMore, reload: () => setVersion((v) => v + 1) };
}
