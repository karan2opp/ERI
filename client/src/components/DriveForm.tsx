import { useState } from 'react';
import { Search } from 'lucide-react';
import type { Drive, DriveType, DriveVisibility, LatLng } from '../types';
import { createGlobalDrive, updateDrive, type NotifyAudience, type Notifying } from '../services/api';
import { geocodeLocation } from '../utils/geo';
import { Button } from './ui/button';
import { Chips } from './ui/chips';
import { Field, Input, Textarea } from './ui/field';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';
import { MiniMap } from './MiniMap';

// Mumbai, when we don't know where you are
const FALLBACK_CENTER: LatLng = { lat: 19.076, lng: 72.8777 };

const AUDIENCE_TEXT: Record<NotifyAudience, string> = {
  NONE: 'Nobody is told.',
  TEAM: 'Team members and admins get an email and a push notification (if they have them turned on).',
  EVERYONE: 'Every user gets an email and a push notification (if they have them turned on).',
};

/** Who to tell about a drive: nobody, team members, or everyone (everyone only for drives everyone can see). */
export const AudienceField: React.FC<{
  label: string;
  value: NotifyAudience;
  onChange: (next: NotifyAudience) => void;
  everyoneAllowed: boolean;
}> = ({ label, value, onChange, everyoneAllowed }) => {
  // A team-only drive can't be announced to everyone
  const shown: NotifyAudience = value === 'EVERYONE' && !everyoneAllowed ? 'TEAM' : value;
  return (
    <Field label={label} description={AUDIENCE_TEXT[shown] + (everyoneAllowed ? '' : ' To tell everyone, make the drive visible to everyone first.')}>
      <Chips
        label={label}
        size="sm"
        value={shown}
        onChange={onChange}
        options={[
          { value: 'TEAM', label: 'Team members' },
          ...(everyoneAllowed ? [{ value: 'EVERYONE' as const, label: 'Everyone' }] : []),
          { value: 'NONE', label: "Don't send" },
        ]}
        className="flex-wrap"
      />
    </Field>
  );
};

/** "Telling 12 people by email and 5 devices.", or null when nobody is being told. */
export const notifyMessage = (n: Notifying | undefined): string | null => {
  if (!n || n.audience === 'NONE') return null;
  const people = `${n.emails} ${n.emails === 1 ? 'person' : 'people'} by email`;
  const devices = `${n.devices} ${n.devices === 1 ? 'device' : 'devices'} by notification`;
  return `Telling ${people} and ${devices}.`;
};

/**
 * Schedule a drive, or (with `drive`) edit one. When creating, it asks who to tell; when editing, it
 * offers to tell people about the change (on by default if the date, time or place changed).
 */
export const DriveForm: React.FC<{
  you: LatLng | null;
  drive?: Drive;
  onDone: (drive: Drive, notifying: Notifying | undefined) => void;
}> = ({ you, drive, onDone }) => {
  const editing = Boolean(drive);
  const [title, setTitle] = useState(drive?.title ?? '');
  const [description, setDescription] = useState(drive?.description ?? '');
  const [date, setDate] = useState(drive?.date ?? '');
  const [time, setTime] = useState(drive?.time ?? '');
  const [address, setAddress] = useState(drive?.address ?? '');
  const [mapsUrl, setMapsUrl] = useState(drive?.googleMapsUrl ?? '');
  const [type, setType] = useState<DriveType>(drive?.type ?? 'PLANTATION');
  // Team only unless chosen otherwise, so a drive is never public by accident
  const [visibility, setVisibility] = useState<DriveVisibility>(drive?.visibility ?? 'TEAM');
  const startAt: LatLng = drive && drive.latitude != null && drive.longitude != null ? { lat: drive.latitude, lng: drive.longitude } : (you ?? FALLBACK_CENTER);
  const [center, setCenter] = useState<LatLng>(startAt);
  const [recenter, setRecenter] = useState(0);
  const [place, setPlace] = useState('');
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing: changing when or where is worth telling people about, so that's the default until they choose
  const movedPlace = Math.abs(center.lat - startAt.lat) > 1e-6 || Math.abs(center.lng - startAt.lng) > 1e-6;
  const importantChange = editing && (date !== drive!.date || time !== drive!.time || address.trim() !== (drive!.address ?? '') || movedPlace);
  const [chosen, setChosen] = useState<NotifyAudience | null>(null);
  const audience: NotifyAudience = chosen ?? (editing ? (importantChange ? 'TEAM' : 'NONE') : 'TEAM');
  const everyoneAllowed = visibility === 'ALL';
  const effectiveAudience: NotifyAudience = audience === 'EVERYONE' && !everyoneAllowed ? 'TEAM' : audience;

  const findPlace = async () => {
    if (!place.trim()) return;
    setFinding(true);
    const found = await geocodeLocation(place.trim());
    setFinding(false);
    if (found) {
      setCenter(found);
      setRecenter((r) => r + 1);
      if (!address) setAddress(place.trim());
    } else {
      setError(`Couldn't find "${place.trim()}". Try a nearby landmark.`);
    }
  };

  const blocker = !title.trim() ? 'Add a title to continue' : !date || !time ? 'Choose a date and time' : !description.trim() ? 'Say what volunteers will do' : null;

  const submit = async () => {
    if (blocker) return;
    setBusy(true);
    setError(null);
    try {
      const fields = {
        title: title.trim(),
        description: description.trim(),
        date,
        time,
        address: address.trim(),
        latitude: center.lat,
        longitude: center.lng,
        type,
        visibility,
        notify: effectiveAudience,
      };
      if (drive) {
        // '' clears the link
        const res = await updateDrive(drive.id, { ...fields, googleMapsUrl: mapsUrl.trim() });
        onDone(res.drive, res.notifying);
      } else {
        const res = await createGlobalDrive({ ...fields, googleMapsUrl: mapsUrl.trim() || undefined });
        onDone(res.data, res.notifying);
      }
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || (editing ? "Couldn't save the drive. Try again." : "Couldn't schedule the drive. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Field label="Kind of drive">
        <Chips
          label="Kind of drive"
          value={type}
          onChange={setType}
          options={[{ value: 'PLANTATION', label: 'Plantation drive' }, { value: 'CLEANUP', label: 'Clean-up drive' }]}
          className="flex-wrap"
        />
      </Field>
      <Field label="Who can see it" description={visibility === 'ALL' ? 'Everyone, including people who are not signed in.' : 'Only team members and admins. Admins always see every drive.'}>
        <Chips
          label="Who can see it"
          value={visibility}
          onChange={setVisibility}
          options={[{ value: 'TEAM', label: 'Team only' }, { value: 'ALL', label: 'Everyone' }]}
          className="flex-wrap"
        />
      </Field>
      <Field label="Title" htmlFor="drive-title">
        <Input id="drive-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunday planting at Shivaji Park" maxLength={255} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="drive-date">
          <Input id="drive-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time" htmlFor="drive-time">
          <Input id="drive-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="What will volunteers do?" htmlFor="drive-desc" description="What to bring, where to meet, how long it takes.">
        <Textarea id="drive-desc" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </Field>
      <Field label="Where" description="Search for the area, then move the map so the pin sits on the meeting point.">
        <div className="flex gap-2">
          <Input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
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
      <Field label="Address or landmark (optional)" htmlFor="drive-address">
        <Input id="drive-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
      </Field>
      <Field label="Google Maps link (optional)" htmlFor="drive-maps">
        <Input id="drive-maps" type="url" inputMode="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" maxLength={1000} />
      </Field>

      <AudienceField
        label={editing ? 'Tell people about this change' : 'Tell people about this drive'}
        value={audience}
        onChange={setChosen}
        everyoneAllowed={everyoneAllowed}
      />

      {error && <Alert tone="error">{error}</Alert>}
      <Button size="xl" onClick={submit} disabled={Boolean(blocker) || busy}>
        {busy && <Spinner />}
        {blocker ?? (editing ? 'Save changes' : 'Schedule drive')}
      </Button>
    </div>
  );
};
