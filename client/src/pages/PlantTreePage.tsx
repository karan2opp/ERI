import { useEffect, useRef, useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import type { LatLng, Tree, TreeCategory } from '../types';
import { checkTreePhoto, createTree, type PhotoVerdict } from '../services/api';
import { discardPhoto, uploadPhotos, type UploadedPhoto } from '../lib/uploadPhoto';
import { MAX_GPS_ACCURACY_M, MAX_PLANTING_DISTANCE_M } from '../lib/trees';
import { getDistanceInMeters, reverseGeocode } from '../utils/geo';
import { FixError, captureLocation, type LocationFix } from '../lib/locationFix';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { CategorySelect } from '../components/CategorySelect';
import { Field, Input, Textarea } from '../components/ui/field';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { PhotoField } from '../components/PhotoField';
import { PlantedAtField, fromLocalParts, toLocalParts } from '../components/PlantedAtField';
import { CareScheduleFields, DEFAULT_SCHEDULE, parseDays, scheduleValid } from '../components/CareScheduleFields';

/**
 * Add a tree. There's no map to set a location on: you stand next to the tree and tap "Confirm
 * location", and the tree is registered at the spot your phone reports at that moment (averaged over
 * a few seconds so it's as accurate as the phone can manage).
 */
export const PlantTreePage: React.FC<{
  /** Where the phone says you are right now (used to notice if you walk away after confirming) */
  you: LatLng | null;
  onClose: () => void;
  onPlanted: (tree: Tree) => void;
}> = ({ you, onClose, onPlanted }) => {
  // The location confirmed at the tree
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [bestSoFar, setBestSoFar] = useState<number | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const capture = useRef<{ cancel: () => void } | null>(null);
  useEffect(() => () => capture.current?.cancel(), []);

  const confirmLocation = () => {
    setLocating(true);
    setLocError(null);
    setBestSoFar(null);
    const c = captureLocation((best) => setBestSoFar(best));
    capture.current = c;
    c.result.then(
      (result) => {
        setLocating(false);
        if (result.accuracy > MAX_GPS_ACCURACY_M) {
          setFix(null);
          setLocError(`Your phone is only sure of your location to about ${Math.round(result.accuracy)} m. Step into the open, away from buildings and tree cover, and try again.`);
        } else setFix(result);
      },
      (err) => {
        setLocating(false);
        setFix(null);
        const reason = err instanceof FixError ? err.reason : 'unavailable';
        setLocError(
          reason === 'denied'
            ? 'Location is blocked for this site. Allow it in your browser settings, then try again.'
            : reason === 'unsupported'
              ? "This browser can't share your location."
              : "Couldn't get your location. Check that location is on, step into the open and try again. On a computer this usually doesn't work: plant from your phone, next to the tree."
        );
      }
    );
  };

  // Walked away after confirming: the tree isn't here any more, so ask again
  const movedAway = Boolean(fix && you && getDistanceInMeters(you.lat, you.lng, fix.lat, fix.lng) > MAX_PLANTING_DISTANCE_M);
  useEffect(() => {
    if (movedAway) {
      setFix(null);
      setLocError(`You've moved more than ${MAX_PLANTING_DISTANCE_M} m from the spot you confirmed. Go back to the tree and confirm your location again.`);
    }
  }, [movedAway]);

  const [photo, setPhoto] = useState<File | null>(null);
  // The photo goes straight from the phone to Cloudinary the moment it is taken (never through our server), and is
  // checked there. A retake, or leaving the page, throws the old upload away.
  const [uploaded, setUploaded] = useState<UploadedPhoto | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadTry, setUploadTry] = useState(0);
  // Checked once uploaded: null while checking, 'ERROR' if the check couldn't be done
  // (planting still checks on the server, so that doesn't block anything)
  const [verdict, setVerdict] = useState<PhotoVerdict | 'ERROR' | null>(null);
  useEffect(() => {
    setUploaded(null);
    setVerdict(null);
    setUploadError(null);
    if (!photo) return;
    let cancelled = false;
    const sent: { photo: UploadedPhoto | null } = { photo: null };
    (async () => {
      try {
        [sent.photo] = await uploadPhotos('TREE', [photo]);
        if (cancelled) return;
        setUploaded(sent.photo);
        const v = await checkTreePhoto(sent.photo).catch(() => 'ERROR' as const);
        if (!cancelled) setVerdict(v);
      } catch (err) {
        if (!cancelled) setUploadError(err instanceof Error ? err.message : "The photo couldn't be uploaded. Try again.");
      }
    })();
    return () => {
      cancelled = true;
      // Once the tree is planted the server has already used this photo, so this does nothing
      if (sent.photo) void discardPhoto(sent.photo.publicId);
    };
  }, [photo, uploadTry]);
  const uploading = Boolean(photo) && !uploaded && !uploadError;
  const checking = Boolean(uploaded) && verdict === null;
  const [category, setCategory] = useState<TreeCategory | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  // Defaults to now; change it to add a tree that was planted earlier
  const [plantedDate, setPlantedDate] = useState(() => toLocalParts(new Date()).date);
  const [plantedTime, setPlantedTime] = useState(() => toLocalParts(new Date()).time);
  const plantedAt = fromLocalParts(plantedDate, plantedTime);
  // How often it needs water, fertiliser and grass removal (days)
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const plantedInFuture = plantedAt !== null && plantedAt.getTime() > Date.now() + 5 * 60 * 1000;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill in the address for the confirmed spot
  useEffect(() => {
    if (!fix) return;
    let cancelled = false;
    reverseGeocode(fix.lat, fix.lng).then((a) => {
      if (!cancelled) setAddress(a);
    });
    return () => {
      cancelled = true;
    };
  }, [fix?.lat, fix?.lng]);

  // What's still missing, shown on the button
  const blocker = locating
    ? 'Getting your location…'
    : !fix
      ? 'Confirm your location to continue'
      : !photo
        ? 'Take a photo of the tree'
        : uploadError
          ? 'Upload the photo again'
          : uploading
            ? 'Uploading your photo…'
            : checking
              ? 'Checking your photo…'
          : verdict === 'FALSE'
            ? 'Retake the photo'
            : !plantedAt
              ? 'Choose when it was planted'
              : plantedInFuture
                ? "Planting time can't be in the future"
                : !scheduleValid(schedule)
                  ? 'Care intervals must be 1 to 365 days'
                  : !category
                    ? 'Choose what kind of tree it is'
                    : !name.trim()
                      ? 'Give it a name to continue'
                      : null;

  const submit = async () => {
    if (blocker || !fix || !uploaded || !category) return;
    setBusy(true);
    setError(null);
    try {
      onPlanted(
        await createTree({
          name: name.trim(),
          categoryId: category.id,
          description: description.trim(),
          address: address.trim(),
          // The tree is registered exactly where the location was confirmed. The same reading goes as the
          // device position, which the server checks (distance and accuracy) before it saves anything.
          latitude: fix.lat,
          longitude: fix.lng,
          deviceLatitude: fix.lat,
          deviceLongitude: fix.lng,
          deviceAccuracy: fix.accuracy,
          plantedAt: plantedAt?.toISOString(),
          waterEveryDays: parseDays(schedule.water)!,
          fertilizeEveryDays: parseDays(schedule.fertilize)!,
          weedEveryDays: parseDays(schedule.weed)!,
          photo: uploaded,
        })
      );
    } catch (err) {
      const res = (err as { response?: { status?: number; data?: { error?: string; code?: string } } })?.response;
      // The server threw this photo away (rejected, or the save failed): a new one has to be taken
      const gone = ['NOT_A_TREE', 'UPLOAD_USED', 'BAD_UPLOAD'].includes(res?.data?.code ?? '') || (res?.status !== undefined && res.status >= 500 && res.status !== 503);
      if (gone) setPhoto(null);
      setError(res?.data?.error || "Couldn't plant the tree. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Plant a tree"
      onBack={onClose}
      footer={
        <Button size="xl" className="w-full" onClick={submit} disabled={Boolean(blocker) || busy}>
          {busy && <Spinner />}
          {blocker ?? 'Plant tree'}
        </Button>
      }
    >
      {/* Where the tree is: you stand next to it and confirm, and that spot is where it's registered */}
      <section className="flex flex-col gap-3 rounded-2xl bg-muted p-4" aria-labelledby="plant-location">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
            {fix ? <Check className="size-5 text-leaf" /> : <MapPin className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="plant-location" className="font-sans text-base font-medium">
              {fix ? 'Location confirmed' : 'Stand next to the tree'}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground" role="status" aria-live="polite">
              {locating
                ? `Getting your exact location… keep still${bestSoFar !== null ? ` (about ${Math.round(bestSoFar)} m so far)` : ''}.`
                : fix
                  ? `The tree will be planted exactly here (accurate to about ${Math.max(1, Math.round(fix.accuracy))} m). Don't walk away until you've planted it.`
                  : 'Stand right next to the tree, then tap Confirm location. The tree is registered exactly where you are standing.'}
            </p>
          </div>
        </div>
        <Button variant={fix ? 'secondary' : 'default'} size="lg" onClick={confirmLocation} disabled={locating}>
          {locating && <Spinner className="size-4" />}
          {locating ? 'Getting your location…' : fix ? 'Confirm again' : locError ? 'Try again' : 'Confirm location'}
        </Button>
        {locError && <Alert tone="error">{locError}</Alert>}
      </section>

      <Field label="Photo of the tree" description="It has to show the tree or plant. Photos of anything else are rejected, and unclear ones are checked by an admin first.">
        <PhotoField file={photo} onChange={setPhoto} />
        {uploading && (
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-4" /> Uploading your photo…
          </p>
        )}
        {checking && (
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-4" /> Checking your photo…
          </p>
        )}
        {uploadError && (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="error">{uploadError}</Alert>
            <Button variant="secondary" size="sm" onClick={() => setUploadTry((n) => n + 1)}>
              Upload again
            </Button>
          </div>
        )}
        {verdict === 'TRUE' && <Alert tone="success">Looks like a tree or plant. Thanks!</Alert>}
        {verdict === 'FALSE' && <Alert tone="error">That doesn't look like a tree or plant. Retake the photo with the tree in the middle of the picture.</Alert>}
        {verdict === 'PENDING' && <Alert tone="info">We couldn't tell for sure. You can still plant it, and an admin will check the photo before the tree shows on the map.</Alert>}
      </Field>

      <Field label="What kind of tree?" htmlFor="plant-category" description="Pick from the list. Can't find it? An admin can add it.">
        <CategorySelect id="plant-category" value={category} onChange={setCategory} />
      </Field>

      <PlantedAtField
        date={plantedDate}
        time={plantedTime}
        onDate={setPlantedDate}
        onTime={setPlantedTime}
        description="Planting it now? Leave this as it is. Adding an older tree? Set when it was planted, and its age is counted from then."
      />

      <CareScheduleFields value={schedule} onChange={setSchedule} />

      <Field label="Name it" htmlFor="tree-name" description="Something people can find it by, like a landmark next to it.">
        <Input id="tree-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neem by the school gate" maxLength={255} />
      </Field>

      <Field label="Address or landmark" htmlFor="tree-address">
        <Input id="tree-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Filled in from the map" maxLength={500} />
      </Field>

      <Field label="About it (optional)" htmlFor="tree-about" description="How old it is, what it needs, who looks after it.">
        <Textarea id="tree-about" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </Field>

      {error && <Alert tone="error">{error}</Alert>}
    </Page>
  );
};
