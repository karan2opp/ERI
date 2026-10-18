import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { LatLng, Tree } from '../types';
import { createTree } from '../services/api';
import { MAX_GPS_ACCURACY_M, MAX_PLANTING_DISTANCE_M, SPECIES_PRESETS, shortSpecies } from '../lib/trees';
import { formatDistance, getDistanceInMeters, reverseGeocode } from '../utils/geo';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Chips } from '../components/ui/chips';
import { Field, Input, Textarea } from '../components/ui/field';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { PhotoField } from '../components/PhotoField';
import { PlantedAtField, fromLocalParts, toLocalParts } from '../components/PlantedAtField';
import { CareScheduleFields, DEFAULT_SCHEDULE, parseDays, scheduleValid } from '../components/CareScheduleFields';

const OTHER = 'OTHER';

/** Add a tree: where it is, a photo, what it is and a name. */
export const PlantTreePage: React.FC<{
  hidden: boolean;
  location: LatLng | null;
  you: LatLng | null;
  /** How sure the phone is of where you are (metres) */
  youAccuracy: number | null;
  onChangeLocation: () => void;
  onClose: () => void;
  onPlanted: (tree: Tree) => void;
}> = ({ hidden, location, you, youAccuracy, onChangeLocation, onClose, onPlanted }) => {
  const [photo, setPhoto] = useState<File | null>(null);
  const [species, setSpecies] = useState<string | null>(null);
  const [customSpecies, setCustomSpecies] = useState('');
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

  // Fill in the address for wherever the pin is
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    reverseGeocode(location.lat, location.lng).then((a) => {
      if (!cancelled) setAddress(a);
    });
    return () => {
      cancelled = true;
    };
  }, [location?.lat, location?.lng]);

  const fromYou = location && you ? getDistanceInMeters(you.lat, you.lng, location.lat, location.lng) : null;
  const tooFar = fromYou !== null && fromYou > MAX_PLANTING_DISTANCE_M;
  const gpsWeak = youAccuracy !== null && youAccuracy > MAX_GPS_ACCURACY_M;

  const finalSpecies = species === OTHER ? customSpecies.trim() : species;
  // What's still missing, shown on the button
  const blocker = !location
    ? 'Set the location to continue'
    : !you || youAccuracy === null
      ? 'Waiting for your location'
      : gpsWeak
        ? 'Your location is not precise enough'
        : tooFar
          ? `Be within ${MAX_PLANTING_DISTANCE_M} m of the tree`
          : !photo
            ? 'Take a photo of the tree'
            : !plantedAt
      ? 'Choose when it was planted'
      : plantedInFuture
        ? "Planting time can't be in the future"
        : !scheduleValid(schedule)
          ? 'Care intervals must be 1 to 365 days'
          : !finalSpecies
          ? 'Choose what kind of tree it is'
          : !name.trim()
            ? 'Give it a name to continue'
            : null;

  const submit = async () => {
    if (blocker || !location || !you || youAccuracy === null || !photo || !finalSpecies) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('species', finalSpecies);
      form.append('description', description.trim());
      form.append('address', address.trim());
      form.append('latitude', String(location.lat));
      form.append('longitude', String(location.lng));
      // Where you are standing right now: the server checks the tree is within 15 m of it
      form.append('deviceLatitude', String(you.lat));
      form.append('deviceLongitude', String(you.lng));
      form.append('deviceAccuracy', String(youAccuracy));
      if (plantedAt) form.append('plantedAt', plantedAt.toISOString());
      form.append('waterEveryDays', String(parseDays(schedule.water)));
      form.append('fertilizeEveryDays', String(parseDays(schedule.fertilize)));
      form.append('weedEveryDays', String(parseDays(schedule.weed)));
      form.append('photo', photo);
      onPlanted(await createTree(form));
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || "Couldn't plant the tree. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (hidden) return null;

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
      <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
        <MapPin className="size-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          {location ? (
            <>
              <span className="font-medium">Location set</span>
              {fromYou !== null && <span className={tooFar ? 'text-destructive' : 'text-muted-foreground'}>, {formatDistance(fromYou)} from you</span>}
            </>
          ) : (
            <span className="text-muted-foreground">Finding your location…</span>
          )}
        </p>
        <Button variant="secondary" onClick={onChangeLocation}>
          {location ? 'Change' : 'Set on map'}
        </Button>
      </div>

      {tooFar && (
        <Alert tone="error">
          You can only register a tree within {MAX_PLANTING_DISTANCE_M} m of where you are standing. Walk to the tree, or move the pin onto where you are.
        </Alert>
      )}
      {gpsWeak && (
        <Alert tone="thirsty">
          Your phone's location is only accurate to about {Math.round(youAccuracy!)} m. Step into the open and wait a few seconds.
        </Alert>
      )}

      <Field label="Photo of the tree" description="It has to show the tree or plant. Photos of anything else are rejected, and unclear ones are checked by an admin first.">
        <PhotoField file={photo} onChange={setPhoto} />
      </Field>

      <Field label="What kind of tree?" description={species === OTHER ? undefined : 'Not sure? Pick Other and describe it.'}>
        <Chips
          label="Species"
          value={species}
          onChange={setSpecies}
          options={[...SPECIES_PRESETS.map((s) => ({ value: s, label: shortSpecies(s) })), { value: OTHER, label: 'Other' }]}
          className="flex-wrap"
        />
        {species === OTHER && (
          <Input value={customSpecies} onChange={(e) => setCustomSpecies(e.target.value)} placeholder="e.g. Silver oak" aria-label="Kind of tree" maxLength={255} autoFocus />
        )}
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
