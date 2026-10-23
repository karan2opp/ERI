import { useState } from 'react';
import { AlignLeft, Calendar, Check, Clock, ExternalLink, Map as MapIcon, MapPin, Navigation, Share2, Type } from 'lucide-react';
import type { Drive, LatLng } from '../types';
import { driveMapsUrl, driveStartsAt, isUpcoming, shareDrive } from '../lib/drives';
import { formatDistance, getDistanceInMeters } from '../utils/geo';
import { Badge } from './ui/badge';
import { Alert } from './ui/alert';
import { Chips } from './ui/chips';
import { DriveTypeBadge, DriveVisibilityBadge } from './DriveBadges';
import { deleteDrive, updateDrive, type NotifyAudience, type Notifying } from '../services/api';
import { Page } from './ui/top-bar';
import { ConfirmDialog } from './ui/confirm-dialog';
import { AudienceField, DriveForm } from './DriveForm';
import { ExpandableText } from './ui/expandable-text';
import { Button, buttonClass } from './ui/button';
import { formatClock, formatTime } from '../lib/time';
import { LiveTracker } from './LiveTracker';
import { MiniMap } from './MiniMap';
import { DriveRecap } from './DriveRecap';
import { DriveWrapUp } from './DriveWrapUp';

/** A labelled detail: small label above, value below, with an icon. */
const DetailRow: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex gap-3 px-4 py-3.5">
    <span className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-5" aria-hidden="true">{icon}</span>
    <div className="min-w-0 flex-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  </div>
);

/** Everything about one drive: when, where, what to do, share it, and who's walking there now. */
export const DriveView: React.FC<{
  drive: Drive;
  you: LatLng | null;
  onShowOnMap: (d: Drive) => void;
  /** Starts walking directions to the drive on our own map */
  onDirections?: (d: Drive) => void;
  /** Team members and admins also see who can see the drive */
  showVisibility?: boolean;
  /** Admins can edit the drive; called with the saved drive */
  onUpdated?: (drive: Drive, notifying?: Notifying) => void;
  /** Admins can delete the drive; called once it is gone, so the page can close */
  onDeleted?: (notifying?: Notifying) => void;
}> = ({ drive, you, onShowOnMap, onDirections, showVisibility = false, onUpdated, onDeleted }) => {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Cancelling a coming-up drive is worth telling people about; one that already happened isn't
  const [cancelAudience, setCancelAudience] = useState<NotifyAudience>(isUpcoming(drive) ? 'TEAM' : 'NONE');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const spot = drive.latitude != null && drive.longitude != null ? { lat: drive.latitude, lng: drive.longitude } : null;
  const maps = driveMapsUrl(drive);
  const upcoming = isUpcoming(drive);
  const completed = drive.status === 'COMPLETED';
  const meters = you && spot ? getDistanceInMeters(you.lat, you.lng, spot.lat, spot.lng) : null;

  const share = async () => {
    if (await shareDrive(drive)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const change = async (settings: { type?: Drive['type']; visibility?: Drive['visibility'] }) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await updateDrive(drive.id, settings);
      onUpdated?.(res.drive, res.notifying);
    } catch (err) {
      setSaveError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const at = driveStartsAt(drive);
  const fullDate = at ? at.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : drive.date;
  const time = at ? formatTime(at) : formatClock(drive.time);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5">
        <DriveTypeBadge type={drive.type} />
        {showVisibility && <DriveVisibilityBadge visibility={drive.visibility} />}
        <Badge variant={upcoming || completed ? 'healthy' : 'outline'}>{completed ? 'Completed' : upcoming ? 'Upcoming' : 'Past'}</Badge>
      </div>

      {/* Every detail with its label */}
      <dl className="flex flex-col divide-y divide-border rounded-2xl bg-muted">
        <DetailRow icon={<Type />} label="Title">
          <span className="font-heading text-xl font-bold">{drive.title}</span>
        </DetailRow>
        <DetailRow icon={<Calendar />} label="Date">
          {fullDate}
        </DetailRow>
        <DetailRow icon={<Clock />} label="Time">
          {time}
        </DetailRow>
        <DetailRow icon={<MapPin />} label="Location">
          {drive.address || (spot ? 'Pinned on the map' : <span className="text-muted-foreground">No location given</span>)}
          {meters !== null && <span className="text-muted-foreground"> · {formatDistance(meters)} away</span>}
        </DetailRow>
        <DetailRow icon={<AlignLeft />} label="Description">
          <ExpandableText text={drive.description} />
        </DetailRow>
      </dl>

      {/* Get directions starts the walk on our own map; Google Maps is its own separate option below */}
      {spot && onDirections ? (
        <Button size="xl" className="w-full" onClick={() => onDirections(drive)}>
          <Navigation aria-hidden="true" /> Get directions
        </Button>
      ) : (
        maps && (
          <a href={maps} target="_blank" rel="noopener noreferrer" className={buttonClass('default', 'xl', 'w-full')}>
            <ExternalLink aria-hidden="true" /> Get directions
          </a>
        )
      )}
      {/* One button fills the row; two share it */}
      <div className={spot ? 'grid grid-cols-2 gap-2' : 'flex'}>
        <Button variant="secondary" size="xl" onClick={share} className="w-full">
          {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />} {copied ? 'Link copied' : 'Share'}
        </Button>
        {spot && (
          <Button variant="secondary" size="xl" onClick={() => onShowOnMap(drive)}>
            <MapIcon aria-hidden="true" /> Show on map
          </Button>
        )}
      </div>
      {maps && spot && onDirections && (
        <a href={maps} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'xl', 'w-full')}>
          <ExternalLink aria-hidden="true" /> Open in Google Maps
        </a>
      )}

      {/* How it went: everyone who can see the drive reads the summary and sees the pictures once it is completed.
          Admins get the editor instead, with the same pictures. */}
      {onUpdated ? <DriveWrapUp drive={drive} onUpdated={(d) => onUpdated(d)} /> : <DriveRecap drive={drive} />}

      {/* Admins decide what kind of drive it is and who sees it */}
      {onUpdated && (
        <section className="flex flex-col gap-3 rounded-2xl bg-muted p-4" aria-labelledby="drive-settings">
          <h3 id="drive-settings" className="text-lg">Drive settings</h3>
          <Chips
            label="Kind of drive"
            size="sm"
            value={drive.type}
            onChange={(type) => change({ type })}
            options={[{ value: 'PLANTATION', label: 'Plantation drive' }, { value: 'CLEANUP', label: 'Clean-up drive' }]}
            className="flex-wrap"
          />
          <Chips
            label="Who can see it"
            size="sm"
            value={drive.visibility}
            onChange={(visibility) => change({ visibility })}
            options={[{ value: 'ALL', label: 'Everyone' }, { value: 'TEAM', label: 'Team only' }]}
            className="flex-wrap"
          />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {saving ? 'Saving…' : drive.visibility === 'ALL' ? 'Everyone, including people who are not signed in, can see this drive.' : 'Only team members and admins can see this drive.'}
          </p>
          {saveError && <Alert tone="error">{saveError}</Alert>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit drive</Button>
            <Button variant="destructive" onClick={() => setDeleting(true)}>Delete drive</Button>
          </div>
        </section>
      )}

      {editing && (
        <Page title="Edit drive" onBack={() => setEditing(false)}>
          <DriveForm
            you={you}
            drive={drive}
            onDone={(saved, notifying) => {
              setEditing(false);
              onUpdated?.(saved, notifying);
            }}
          />
        </Page>
      )}

      <ConfirmDialog
        open={deleting}
        title={`Delete ${drive.title}?`}
        description="The drive is removed for everyone and this can't be undone."
        confirmLabel="Delete drive"
        busy={removing}
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          setRemoving(true);
          setSaveError(null);
          try {
            const notifying = await deleteDrive(drive.id, cancelAudience);
            setDeleting(false);
            onDeleted?.(notifying);
          } catch (err) {
            setDeleting(false);
            setSaveError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't delete the drive. Try again.");
          } finally {
            setRemoving(false);
          }
        }}
      >
        <AudienceField label="Tell people it's cancelled" value={cancelAudience} onChange={setCancelAudience} everyoneAllowed={drive.visibility === 'ALL'} />
      </ConfirmDialog>

      {/* Live walking only makes sense for drives that haven't happened yet */}
      {upcoming && <LiveTracker room={`drive_${drive.id}`} targetName={drive.title} />}
      {spot && <MiniMap center={spot} pin={spot} pinCleanup={drive.type === 'CLEANUP'} liveRoom={upcoming ? `drive_${drive.id}` : undefined} />}
    </div>
  );
};
