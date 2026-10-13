import { SignInButton, useUser } from '@clerk/react';
import { Calendar, ExternalLink, Navigation, Radio, X } from 'lucide-react';
import type { Drive, LatLng } from '../../types';
import { formatDistance, getDistanceInMeters, walkMinutes } from '../../utils/geo';
import { driveMapsUrl, formatDriveDate } from '../../lib/drives';
import { Badge } from '../ui/badge';
import { Button, buttonClass } from '../ui/button';

/** A planting drive selected on the map. */
export const DriveDetails: React.FC<{
  drive: Drive;
  you: LatLng | null;
  onClose: () => void;
  onDirections: () => void;
  onWalkLive: () => void;
}> = ({ drive, you, onClose, onDirections, onWalkLive }) => {
  const { isSignedIn } = useUser();
  const meters = you && drive.latitude != null && drive.longitude != null ? getDistanceInMeters(you.lat, you.lng, drive.latitude, drive.longitude) : null;
  const maps = driveMapsUrl(drive);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Badge variant="drive" className="self-start">Planting drive</Badge>
          <h2 className="text-xl leading-tight">{drive.title}</h2>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-4 shrink-0" aria-hidden="true" /> {formatDriveDate(drive)}
          </p>
          {drive.address && <p className="text-muted-foreground">{drive.address}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close drive details" className="-mt-1 -mr-2">
          <X className="size-5!" />
        </Button>
      </div>

      {meters !== null && (
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-4xl font-bold tabular-nums">{formatDistance(meters)}</span>
          <span className="text-muted-foreground">{walkMinutes(meters)} min walk</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button size="xl" onClick={onDirections} className="w-full">
          <Navigation aria-hidden="true" /> Directions
        </Button>
        <div className="grid grid-cols-2 gap-2">
          {isSignedIn ? (
            <Button variant="secondary" size="xl" onClick={onWalkLive}>
              <Radio aria-hidden="true" /> Walk live
            </Button>
          ) : (
            <SignInButton mode="modal">
              <Button variant="secondary" size="xl">
                <Radio aria-hidden="true" /> Walk live
              </Button>
            </SignInButton>
          )}
          {maps && (
            <a href={maps} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'xl')}>
              <ExternalLink aria-hidden="true" /> Maps
            </a>
          )}
        </div>
      </div>

      <p className="leading-relaxed whitespace-pre-wrap">{drive.description}</p>
    </div>
  );
};
