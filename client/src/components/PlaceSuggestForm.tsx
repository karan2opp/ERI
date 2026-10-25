import { useEffect, useRef, useState } from 'react';
import { SignInButton, useAuth } from '@clerk/react';
import { ImagePlus, Search, X } from 'lucide-react';
import type { LatLng } from '../types';
import { sendPlaceSuggestion, type PlaceForm, type PlaceKind } from '../services/api';
import { geocodeLocation } from '../utils/geo';
import { shrinkImage } from '../lib/shrinkImage';
import { discardPhoto, uploadPhotos, type UploadedPhoto } from '../lib/uploadPhoto';
import { Button } from './ui/button';
import { Chips } from './ui/chips';
import { Field, Input, Textarea } from './ui/field';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';
import { MiniMap } from './MiniMap';

// Mumbai, when we don't know where you are
const FALLBACK_CENTER: LatLng = { lat: 19.076, lng: 72.8777 };
export const MAX_PLACE_PHOTOS = 5;

// `uploaded` is set once the picture is on Cloudinary, so sending again after a problem doesn't upload it twice
type Photo = { file: File; preview: string; uploaded?: UploadedPhoto };

const moved = (a: LatLng, b: LatLng) => Math.abs(a.lat - b.lat) > 1e-6 || Math.abs(a.lng - b.lng) > 1e-6;

/**
 * Sending a place through an open form: what it's for (when the form takes either), the pin on our map and/or a
 * Google Maps link, a landmark, the form's questions and up to 5 pictures. Signed-out visitors are asked to sign in.
 */
export const PlaceSuggestForm: React.FC<{ form: PlaceForm; you: LatLng | null; onSent: () => void }> = ({ form, you, onSent }) => {
  const { isSignedIn } = useAuth();
  const [kind, setKind] = useState<PlaceKind | null>(form.kind === 'EITHER' ? null : form.kind);
  const startAt = useRef<LatLng>(you ?? FALLBACK_CENTER).current;
  const [center, setCenter] = useState<LatLng>(startAt);
  // The pin counts once it is somewhere real: where you are, or where you moved the map
  const pinPlaced = Boolean(you) || moved(center, startAt);
  const [recenter, setRecenter] = useState(0);
  const [search, setSearch] = useState('');
  const [finding, setFinding] = useState(false);
  const [mapsUrl, setMapsUrl] = useState('');
  const [landmark, setLandmark] = useState('');
  const [answers, setAnswers] = useState<string[]>(() => form.questions.map(() => ''));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  // What is happening while sending (uploading the pictures, then the place)
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Free the picture previews when leaving
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const findPlace = async () => {
    if (!search.trim()) return;
    setFinding(true);
    setError(null);
    const found = await geocodeLocation(search.trim());
    setFinding(false);
    if (found) {
      setCenter(found);
      setRecenter((r) => r + 1);
      if (!landmark) setLandmark(search.trim());
    } else {
      setError(`Couldn't find "${search.trim()}". Try a nearby landmark, or move the map yourself.`);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PLACE_PHOTOS - photos.length;
    const chosen = [...files].slice(0, room);
    setError(files.length > room ? `Only ${MAX_PLACE_PHOTOS} pictures can be added, so the first ${room} were kept.` : null);
    setPreparing(true);
    const ready = await Promise.all(chosen.map(shrinkImage));
    setPreparing(false);
    setPhotos((list) => [...list, ...ready.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_PLACE_PHOTOS));
  };

  const removePhoto = (photo: Photo) => {
    URL.revokeObjectURL(photo.preview);
    if (photo.uploaded) void discardPhoto(photo.uploaded.publicId);
    setPhotos((list) => list.filter((p) => p !== photo));
  };

  const link = mapsUrl.trim();
  const blocker = !kind
    ? 'Choose what the place is for'
    : !pinPlaced && !link
      ? 'Move the map to the place, or paste a Google Maps link'
      : !landmark.trim()
        ? 'Add a landmark'
        : answers.some((a) => !a.trim())
          ? form.questions.length === 1
            ? 'Answer the question'
            : 'Answer every question'
          : null;

  const submit = async () => {
    if (blocker || !kind) return;
    setBusy(true);
    setError(null);
    try {
      // The pictures go straight to Cloudinary first (never through our server); only then is the place sent
      let ready = photos;
      const waiting = photos.filter((p) => !p.uploaded);
      if (waiting.length > 0) {
        setStage(`Uploading ${waiting.length === 1 ? 'your picture' : `${waiting.length} pictures`}…`);
        const refs = await uploadPhotos('PLACE', waiting.map((p) => p.file));
        let next = 0;
        ready = photos.map((p) => (p.uploaded ? p : { ...p, uploaded: refs[next++] }));
        setPhotos(ready);
      }
      setStage('Sending…');
      await sendPlaceSuggestion(form.id, {
        kind: form.kind === 'EITHER' ? kind : undefined,
        pin: pinPlaced ? center : null,
        googleMapsUrl: link,
        landmark: landmark.trim(),
        answers: answers.map((a) => a.trim()),
        photos: ready.map((p) => p.uploaded!),
      });
      onSent();
    } catch (err) {
      const res = (err as { response?: { data?: { error?: string } } })?.response;
      // When the server answered, it has thrown the uploaded pictures away: they are sent again next time
      if (res) setPhotos((list) => list.map((p) => ({ ...p, uploaded: undefined })));
      setError(res?.data?.error || (err instanceof Error ? err.message : undefined) || "Couldn't send the place. Check your connection and try again.");
    } finally {
      setStage(null);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {form.kind === 'EITHER' && (
        <Field label="What is the place for?">
          <Chips
            label="What is the place for?"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'PLANTATION', label: 'Planting trees' },
              { value: 'CLEANUP', label: 'A clean-up drive' },
            ]}
            className="flex-wrap"
          />
        </Field>
      )}

      <Field
        label="Where is it?"
        description={you ? 'The pin starts where you are. Move the map so the pin sits on the place.' : 'Search for the area, then move the map so the pin sits on the place.'}
      >
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                findPlace();
              }
            }}
            placeholder="Search a place"
            aria-label="Search a place"
          />
          <Button variant="secondary" size="xl" onClick={findPlace} disabled={finding} aria-label="Find place">
            {finding ? <Spinner /> : <Search aria-hidden="true" />}
          </Button>
        </div>
        <MiniMap center={center} recenterToken={recenter} onCenterChange={setCenter} />
      </Field>

      <Field
        label="Google Maps link (optional)"
        htmlFor="place-maps"
        description="Easier on Google Maps? Drop a pin there, tap Share, copy the link and paste it here."
      >
        <Input id="place-maps" type="url" inputMode="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" maxLength={1000} />
      </Field>

      <Field label="Landmark" htmlFor="place-landmark" description="A name people know, so we can find it: a park, a school, a temple, a road.">
        <Input id="place-landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. Behind Nehru Park, near the water tank" maxLength={255} />
      </Field>

      {form.questions.map((question, i) => (
        <Field key={i} label={question} htmlFor={`place-answer-${i}`}>
          <Textarea
            id={`place-answer-${i}`}
            rows={3}
            value={answers[i]}
            onChange={(e) => setAnswers((list) => list.map((a, j) => (j === i ? e.target.value : a)))}
            maxLength={1000}
          />
        </Field>
      ))}

      <Field label={`Pictures (optional, up to ${MAX_PLACE_PHOTOS})`} description="Pictures of the place help us plan. Big photos are made smaller before they are sent.">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((photo, i) => (
            <li key={photo.preview} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
              <img src={photo.preview} alt={`Picture ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(photo)}
                aria-label={`Remove picture ${i + 1}`}
                className="absolute top-1 right-1 grid size-8 cursor-pointer place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
          {photos.length < MAX_PLACE_PHOTOS && (
            <li>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={preparing}
                className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
              >
                {preparing ? <Spinner /> : <ImagePlus className="size-6" aria-hidden="true" />}
                {photos.length === 0 ? 'Add pictures' : 'Add more'}
              </button>
            </li>
          )}
        </ul>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {photos.length} of {MAX_PLACE_PHOTOS} pictures added
        </p>
      </Field>

      {error && <Alert tone="error">{error}</Alert>}
      {isSignedIn ? (
        <Button size="xl" onClick={submit} disabled={Boolean(blocker) || busy || preparing}>
          {busy && <Spinner />}
          {busy ? (stage ?? 'Sending…') : (blocker ?? 'Send this place')}
        </Button>
      ) : (
        <SignInButton mode="modal">
          <Button size="xl">Sign in to send this place</Button>
        </SignInButton>
      )}
    </div>
  );
};
