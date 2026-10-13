import { useEffect, useRef, useState } from 'react';
import { SignInButton, useUser } from '@clerk/react';
import { Camera, Droplets, Navigation, Pencil, Radio, Scissors, Search, Sprout, Trash2, X } from 'lucide-react';
import type { CareLog, LatLng, Tree } from '../../types';
import { deleteTree, fetchCareHistory, logCareActivity } from '../../services/api';
import { CARE_ACTIONS, CARE_LABEL, STATUS_LABEL, hoursSinceWatered, isDemoTree, timeAgo, treeStatus, type CareAction } from '../../lib/trees';
import { formatDistance, getDistanceInMeters, walkMinutes } from '../../utils/geo';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Chips } from '../ui/chips';
import { Textarea } from '../ui/field';
import { Alert } from '../ui/alert';
import { Spinner } from '../ui/spinner';
import { ConfirmDialog } from '../ui/confirm-dialog';

const CARE_ICON: Record<CareAction, React.ReactNode> = {
  WATERED: <Droplets className="text-water" aria-hidden="true" />,
  FERTILIZED: <Sprout className="text-leaf" aria-hidden="true" />,
  PRUNED: <Scissors className="text-bark" aria-hidden="true" />,
  INSPECTED: <Search className="text-muted-foreground" aria-hidden="true" />,
};

type Outcome = { tone: 'success' | 'error'; text: string } | null;

const errorText = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message || fallback;
};

/** Tree health: a leaf-green meter, amber when low. */
const HealthMeter: React.FC<{ score: number }> = ({ score }) => {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">Health</span>
        <span className="tabular-nums text-muted-foreground">{clamped}%</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-secondary"
        role="meter"
        aria-label="Tree health"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <div className={`h-full rounded-full ${clamped < 50 ? 'bg-warning' : 'bg-leaf'}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
};

const CareForm: React.FC<{ tree: Tree; onDone: (outcome: Outcome) => void; onCancel: () => void }> = ({ tree, onDone, onCancel }) => {
  const [action, setAction] = useState<CareAction>('WATERED');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.append('actionType', action);
      if (notes.trim()) form.append('notes', notes.trim());
      if (photo) form.append('photo', photo);
      await logCareActivity(tree.id, form);
      onDone({ tone: 'success', text: `${CARE_LABEL[action]}. Thanks for looking after ${tree.name}.` });
    } catch (err) {
      onDone({ tone: 'error', text: errorText(err, "Couldn't save that. Check your connection and try again.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-muted p-4 animate-rise">
      <div className="flex items-center justify-between">
        <h3 className="text-lg">What did you do?</h3>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
      <Chips
        label="Care activity"
        value={action}
        onChange={setAction}
        options={CARE_ACTIONS.map((a) => ({ value: a, label: CARE_LABEL[a] }))}
        className="flex-wrap"
      />
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note (optional), e.g. 5 litres and fresh mulch" rows={2} maxLength={2000} aria-label="Note" className="bg-card" />
      <label className="flex h-12 cursor-pointer items-center gap-3 rounded-2xl bg-card px-4 text-[15px] focus-within:ring-2 focus-within:ring-ring">
        <Camera className="size-5 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{photo ? photo.name : 'Add a photo (optional)'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </label>
      <Button type="submit" size="xl" disabled={busy}>
        {busy && <Spinner className="size-5" />} Save care log
      </Button>
    </form>
  );
};

export const TreeDetails: React.FC<{
  tree: Tree;
  you: LatLng | null;
  onClose: () => void;
  onDirections: () => void;
  onWalkLive: () => void;
  onEdit: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}> = ({ tree, you, onClose, onDirections, onWalkLive, onEdit, onChanged, onDeleted }) => {
  const { user, isSignedIn } = useUser();
  const [history, setHistory] = useState<CareLog[] | null>(null);
  const [caring, setCaring] = useState(false);
  const [watering, setWatering] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const demo = isDemoTree(tree);
  const status = treeStatus(tree);
  const hours = hoursSinceWatered(tree);
  const meters = you ? getDistanceInMeters(you.lat, you.lng, tree.latitude, tree.longitude) : null;
  const isOwner = Boolean(isSignedIn && user && (user.id === tree.userId || user.id === tree.owner?.id));

  const loadHistory = () => {
    if (demo) {
      setHistory([]);
      return;
    }
    fetchCareHistory(tree.id).then(setHistory, () => setHistory([]));
  };

  useEffect(() => {
    setHistory(null);
    setCaring(false);
    setOutcome(null);
    topRef.current?.scrollIntoView({ block: 'start' });
    loadHistory();
    // Reload when a different tree is selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.id]);

  const careDone = (result: Outcome) => {
    setOutcome(result);
    if (result?.tone === 'success') {
      setCaring(false);
      loadHistory();
      onChanged();
    }
  };

  const quickWater = async () => {
    setWatering(true);
    try {
      const form = new FormData();
      form.append('actionType', 'WATERED');
      await logCareActivity(tree.id, form);
      careDone({ tone: 'success', text: `Watered. Thanks for looking after ${tree.name}.` });
    } catch (err) {
      setOutcome({ tone: 'error', text: errorText(err, "Couldn't save that. Try again.") });
    } finally {
      setWatering(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteTree(tree.id);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      setConfirmDelete(false);
      setOutcome({ tone: 'error', text: errorText(err, "Couldn't remove this tree. Try again.") });
    } finally {
      setDeleting(false);
    }
  };

  // Signed-out visitors get Clerk's sign-in instead of the action
  const gated = (button: React.ReactElement) => (isSignedIn ? button : <SignInButton mode="modal">{button}</SignInButton>);

  return (
    <div ref={topRef} className="flex flex-col gap-5 pb-4">
      <div className="flex gap-4">
        <img src={tree.photoUrl} alt={`Photo of ${tree.name}`} className="size-24 shrink-0 rounded-xl bg-muted object-cover" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <h2 className="text-xl leading-tight">{tree.name}</h2>
          <p className="truncate text-muted-foreground">{tree.species}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={status}>{STATUS_LABEL[status]}</Badge>
            {demo && <Badge variant="outline">Sample</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close tree details" className="-mt-1 -mr-2">
          <X className="size-5!" />
        </Button>
      </div>

      {status === 'thirsty' && !demo && (
        <Alert
          tone="thirsty"
          title="Needs water"
          action={gated(
            <Button variant="secondary" onClick={isSignedIn ? quickWater : undefined} disabled={watering} aria-label="Mark as watered">
              {watering ? <Spinner className="size-4" /> : <Droplets aria-hidden="true" />} Watered
            </Button>
          )}
        >
          {hours === null ? 'No care logged yet' : `Last watered ${timeAgo(tree.lastWateredAt!)}`}
        </Alert>
      )}

      {meters !== null && (
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-4xl font-bold tabular-nums">{formatDistance(meters)}</span>
          <span className="text-muted-foreground">{walkMinutes(meters)} min walk</span>
        </div>
      )}

      {outcome && <Alert tone={outcome.tone}>{outcome.text}</Alert>}

      <div className="flex flex-col gap-2">
        <Button size="xl" onClick={onDirections} className="w-full">
          <Navigation aria-hidden="true" /> Directions
        </Button>
        {!demo && (
          <div className="grid grid-cols-2 gap-2">
            {gated(
              <Button variant="secondary" size="xl" onClick={isSignedIn ? () => setCaring(true) : undefined} disabled={caring}>
                <Droplets aria-hidden="true" /> Log care
              </Button>
            )}
            {gated(
              <Button variant="secondary" size="xl" onClick={isSignedIn ? onWalkLive : undefined}>
                <Radio aria-hidden="true" /> Walk live
              </Button>
            )}
          </div>
        )}
      </div>

      {caring && <CareForm tree={tree} onDone={careDone} onCancel={() => setCaring(false)} />}

      <HealthMeter score={tree.healthScore} />

      {tree.description && <p className="leading-relaxed">{tree.description}</p>}

      <div className="flex items-center gap-3">
        <img
          src={tree.owner?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${tree.userId}`}
          alt=""
          className="size-10 rounded-full bg-muted"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">Planted by {tree.owner?.name || 'a neighbour'}</p>
          <p className="text-sm text-muted-foreground">
            {timeAgo(tree.createdAt)}
            {tree.address ? ` · ${tree.address}` : ''}
          </p>
        </div>
      </div>

      {isOwner && !demo && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={onEdit}>
            <Pencil aria-hidden="true" /> Edit
          </Button>
          <Button variant="destructive" size="lg" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" /> Remove
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="care-history">
        <h3 id="care-history" className="text-lg">Care history</h3>
        {history === null ? (
          <Spinner label="Loading care history" />
        ) : history.length === 0 ? (
          <p className="text-muted-foreground">{demo ? 'Sample trees have no history.' : 'No care logged yet. Be the first to water it.'}</p>
        ) : (
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
                  <p className="text-sm text-muted-foreground">by {log.performer?.name || 'a neighbour'}</p>
                  {log.notes && <p className="mt-1">{log.notes}</p>}
                  {log.photoUrl && log.photoUrl !== tree.photoUrl && (
                    <img src={log.photoUrl} alt="Care update" className="mt-2 h-32 w-full rounded-xl object-cover" loading="lazy" />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title={`Remove ${tree.name}?`}
        description="It comes off the map for everyone, along with its care history. This can't be undone."
        confirmLabel="Remove tree"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
};
