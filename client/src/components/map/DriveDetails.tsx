import { useState } from 'react';
import { SignInButton, useUser } from '@clerk/react';
import { Calendar, Check, ExternalLink, Navigation, Radio, Share2, X } from 'lucide-react';
import type { Drive, LatLng } from '../../types';
import { formatDistance, getDistanceInMeters, walkHint } from '../../utils/geo';
import { driveMapsUrl, formatDriveDate, isUpcoming, shareDrive } from '../../lib/drives';
import { Badge } from '../ui/badge';
import { ExpandableText } from '../ui/expandable-text';
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
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (await shareDrive(drive)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex gap-1.5">
            <Badge variant="drive">Planting drive</Badge>
            {!isUpcoming(drive) && <Badge variant="outline">Past</Badge>}
          </div>
          <h2 className="text-xl leading-tight">{drive.title}</h2>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-4 shrink-0" aria-hidden="true" /> {formatDriveDate(drive)}
          </p>
          {drive.address && <p className="text-muted-foreground">{drive.address}</p>}
        </div>
        <div className="-mt-1 -mr-2 flex">
          <Button variant="ghost" size="icon" onClick={share} aria-label={copied ? 'Link copied' : 'Share this drive'}>
            {copied ? <Check className="size-5! text-leaf" /> : <Share2 className="size-5!" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close drive details">
            <X className="size-5!" />
          </Button>
        </div>
      </div>

      {meters !== null && (
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-4xl font-bold tabular-nums">{formatDistance(meters)}</span>
          {walkHint(meters) && <span className="text-muted-foreground">{walkHint(meters)}</span>}
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

      {copied && <p role="status" className="text-sm text-leaf">Link copied. Send it to anyone who wants to join.</p>}

      <ExpandableText text={drive.description} />
    </div>
  );
};
