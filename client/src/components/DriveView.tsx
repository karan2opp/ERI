import { useState } from 'react';
import { AlignLeft, Calendar, Check, Clock, ExternalLink, Map as MapIcon, MapPin, Share2, Type } from 'lucide-react';
import type { Drive, LatLng } from '../types';
import { driveMapsUrl, driveStartsAt, isUpcoming, shareDrive } from '../lib/drives';
import { formatDistance, getDistanceInMeters } from '../utils/geo';
import { Badge } from './ui/badge';
import { ExpandableText } from './ui/expandable-text';
import { Button, buttonClass } from './ui/button';
import { LiveTracker } from './LiveTracker';
import { MiniMap } from './MiniMap';

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

/** Everything about one planting drive: when, where, what to do, share it, and who's walking there now. */
export const DriveView: React.FC<{ drive: Drive; you: LatLng | null; onShowOnMap: (d: Drive) => void }> = ({ drive, you, onShowOnMap }) => {
  const [copied, setCopied] = useState(false);
  const spot = drive.latitude != null && drive.longitude != null ? { lat: drive.latitude, lng: drive.longitude } : null;
  const maps = driveMapsUrl(drive);
  const upcoming = isUpcoming(drive);
  const meters = you && spot ? getDistanceInMeters(you.lat, you.lng, spot.lat, spot.lng) : null;

  const share = async () => {
    if (await shareDrive(drive)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const at = driveStartsAt(drive);
  const fullDate = at ? at.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : drive.date;
  const time = at ? at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : drive.time;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1.5">
        <Badge variant="drive">Planting drive</Badge>
        <Badge variant={upcoming ? 'healthy' : 'outline'}>{upcoming ? 'Upcoming' : 'Past'}</Badge>
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

      {maps && (
        <a href={maps} target="_blank" rel="noopener noreferrer" className={buttonClass('default', 'xl', 'w-full')}>
          <ExternalLink aria-hidden="true" /> Get directions
        </a>
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

      {/* Live walking only makes sense for drives that haven't happened yet */}
      {upcoming && <LiveTracker room={`drive_${drive.id}`} targetName={drive.title} />}
      {spot && <MiniMap center={spot} pin={spot} liveRoom={upcoming ? `drive_${drive.id}` : undefined} />}
    </div>
  );
};
