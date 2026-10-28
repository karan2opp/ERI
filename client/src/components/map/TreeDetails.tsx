import { useEffect, useRef, useState } from 'react';
import { SignInButton, useUser } from '@clerk/react';
import { Camera, Droplets, Navigation, Pencil, Radio, Shovel, Sprout, Trash2, X } from 'lucide-react';
import type { LatLng, Role, Tree } from '../../types';
import { careLock } from '../../lib/schedule';
import { isAdminRole } from '../../lib/roles';
import { deleteTree } from '../../services/api';
import { logCareActivity } from '../../services/photoApi';
import { CARE_ACTIONS, CARE_LABEL, STATUS_LABEL, timeAgo, treeNeeds, type CareAction } from '../../lib/trees';
import { formatDistance, getDistanceInMeters, walkHint } from '../../utils/geo';
import { Badge } from '../ui/badge';
import { ExpandableText } from '../ui/expandable-text';
import { Button } from '../ui/button';
import { Chips } from '../ui/chips';
import { Textarea } from '../ui/field';
import { Alert } from '../ui/alert';
import { Spinner } from '../ui/spinner';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { CareSchedule, CareSummary, CareTimeline, TreeAge, useCareHistory } from '../TreeLife';
import { CameraCapture } from '../CameraCapture';


type Outcome = { tone: 'success' | 'error'; text: string } | null;

/** For each need: the care that meets it, when it was last done, and how to say so. */
const NEED_TASK = {
  thirsty: { action: 'WATERED', last: 'lastWateredAt', done: 'watered', lastText: 'Last watered', never: 'No care logged yet', icon: <Droplets aria-hidden="true" /> },
  fertilize: { action: 'FERTILIZED', last: 'lastFertilizedAt', done: 'fertilised', lastText: 'Last fertilised', never: 'Not fertilised since it was planted', icon: <Sprout aria-hidden="true" /> },
  weed: { action: 'WEEDED', last: 'lastWeededAt', done: 'grass removed', lastText: 'Grass last removed', never: 'The grass has not been removed since it was planted', icon: <Shovel aria-hidden="true" /> },
} as const;

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

const CareForm: React.FC<{ tree: Tree; role: Role; onDone: (outcome: Outcome) => void; onCancel: () => void }> = ({ tree, role, onDone, onCancel }) => {
  // Watering, feeding and removing grass open a day before they're due; start on the first one that's open
  const locks = Object.fromEntries(CARE_ACTIONS.map((a) => [a, careLock(tree, a, role)])) as Record<CareAction, ReturnType<typeof careLock>>;
  const [action, setAction] = useState<CareAction>(() => CARE_ACTIONS.find((a) => !locks[a].locked) ?? 'PRUNED');
  const lockedNotes = CARE_ACTIONS.filter((a) => locks[a].locked).map((a) => locks[a].text);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await logCareActivity(tree.id, { actionType: action, notes: notes.trim() || undefined, photo: photo ?? undefined });
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
        options={CARE_ACTIONS.map((a) => ({ value: a, label: CARE_LABEL[a], disabled: locks[a].locked }))}
        className="flex-wrap"
      />
      {lockedNotes.length > 0 && <p className="text-sm text-muted-foreground">{lockedNotes.join(' · ')}. Each opens a day before it's due.</p>}
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note (optional), e.g. 5 litres and fresh mulch" rows={2} maxLength={2000} aria-label="Note" className="bg-card" />
      {/* A care photo is taken live with the camera; there's no way to pick an existing one */}
      {preview ? (
        <div className="flex items-center gap-3 rounded-2xl bg-card p-2 pr-3">
          <img src={preview} alt="Your care photo" className="size-16 shrink-0 rounded-xl object-cover" />
          <p className="min-w-0 flex-1 font-medium">Photo added</p>
          <Button variant="secondary" size="sm" onClick={() => setCameraOpen(true)}>Retake</Button>
          <Button variant="ghost" size="icon" onClick={() => setPhoto(null)} aria-label="Remove photo">
            <X className="size-5!" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className="flex h-12 cursor-pointer items-center gap-3 rounded-2xl bg-card px-4 text-left text-[15px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Camera className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Take a photo (optional)</span>
        </button>
      )}
      {cameraOpen && (
        <CameraCapture
          hint="Show what you did, like the watered soil or the pruned branch"
          onCapture={(p) => {
            setPhoto(p);
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
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
  /** Your role: admins can edit and remove any tree, and log care at any time */
  role: Role;
}> = ({ tree, you, onClose, onDirections, onWalkLive, onEdit, onChanged, onDeleted, role }) => {
  const { user, isSignedIn } = useUser();
  const [caring, setCaring] = useState(false);
  // The care a one-tap button is saving right now
  const [quick, setQuick] = useState<CareAction | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const needs = treeNeeds(tree);
  const meters = you ? getDistanceInMeters(you.lat, you.lng, tree.latitude, tree.longitude) : null;
  const isOwner = Boolean(isSignedIn && user && (user.id === tree.userId || user.id === tree.owner?.id));
  // The planter manages their tree; admins and super admins manage every tree
  const canManage = isOwner || (Boolean(isSignedIn) && isAdminRole(role));

  // Care history from the server, 10 entries at a time
  const care = useCareHistory(tree.id);
  const history = care.items;

  useEffect(() => {
    setCaring(false);
    setOutcome(null);
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [tree.id]);

  const careDone = (result: Outcome) => {
    setOutcome(result);
    if (result?.tone === 'success') {
      setCaring(false);
      care.reload();
      onChanged();
    }
  };

  const quickCare = async (action: CareAction) => {
    setQuick(action);
    try {
      await logCareActivity(tree.id, { actionType: action });
      careDone({ tone: 'success', text: `${CARE_LABEL[action]}. Thanks for looking after ${tree.name}.` });
    } catch (err) {
      setOutcome({ tone: 'error', text: errorText(err, "Couldn't save that. Try again.") });
    } finally {
      setQuick(null);
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
            {tree.isOld && <Badge variant="outline" title="Planted before this map; not part of the new planted count">Old tree</Badge>}
            {needs.length ? needs.map((n) => <Badge key={n} variant={n}>{STATUS_LABEL[n]}</Badge>) : <Badge variant="healthy">{STATUS_LABEL.healthy}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close tree details" className="-mt-1 -mr-2">
          <X className="size-5!" />
        </Button>
      </div>

      {needs.map((need) => {
        const task = NEED_TASK[need];
        const last = tree[task.last];
        return (
          <Alert
            key={need}
            tone={need}
            title={STATUS_LABEL[need]}
            action={gated(
              <Button variant="secondary" onClick={isSignedIn ? () => quickCare(task.action) : undefined} disabled={quick !== null} aria-label={`Mark as ${task.done}`}>
                {quick === task.action ? <Spinner className="size-4" /> : task.icon} {CARE_LABEL[task.action]}
              </Button>
            )}
          >
            {last ? `${task.lastText} ${timeAgo(last)}` : task.never}
          </Alert>
        );
      })}

      {meters !== null && (
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-4xl font-bold tabular-nums">{formatDistance(meters)}</span>
          {walkHint(meters) && <span className="text-muted-foreground">{walkHint(meters)}</span>}
        </div>
      )}

      {outcome && <Alert tone={outcome.tone}>{outcome.text}</Alert>}

      <div className="flex flex-col gap-2">
        <Button size="xl" onClick={onDirections} className="w-full">
          <Navigation aria-hidden="true" /> Directions
        </Button>
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
      </div>

      {caring && <CareForm tree={tree} role={role} onDone={careDone} onCancel={() => setCaring(false)} />}

      {/* Its age, counted from planting like a birthday */}
      <TreeAge plantedAt={tree.plantedAt} />

      <CareSummary tree={tree} history={history} />

      <CareSchedule tree={tree} />

      <HealthMeter score={tree.healthScore} />

      {tree.description && <ExpandableText text={tree.description} />}

      <div className="flex items-center gap-3">
        <img
          src={tree.owner?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${tree.userId}`}
          alt=""
          className="size-10 rounded-full bg-muted"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">Planted by {tree.owner?.name || 'a neighbour'}</p>
          <p className="text-sm text-muted-foreground">
            Added to the map {timeAgo(tree.createdAt)}
            {tree.address ? ` · ${tree.address}` : ''}
          </p>
        </div>
      </div>

      {canManage && (
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
        <h3 id="care-history" className="text-lg">
          Care history
          {care.total > 0 && <span className="ml-2 font-sans text-base font-normal text-muted-foreground">{care.total}</span>}
        </h3>
        {history === null ? (
          <Spinner label="Loading care history" />
        ) : history.length === 0 ? (
          <p className="text-muted-foreground">No care logged yet. Be the first to water it.</p>
        ) : (
          <CareTimeline
            history={history}
            total={care.total}
            onLoadMore={care.loadMore}
            loadingMore={care.loadingMore}
            treePhotoUrl={tree.photoUrl}
            photoEditor={canManage ? { treeId: tree.id, onChanged: care.reload } : undefined}
          />
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
