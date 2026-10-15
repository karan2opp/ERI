import { useEffect, useState } from 'react';
import { SignInButton, useAuth } from '@clerk/react';
import { Calendar, Check, ExternalLink, MapPin, Share2 } from 'lucide-react';
import type { Drive } from '../types';
import { getDriveById, setAuthTokenGetter } from '../services/api';
import { Logo, Sapling } from '../components/ui/logo';
import { Badge } from '../components/ui/badge';
import { ExpandableText } from '../components/ui/expandable-text';
import { Button, buttonClass } from '../components/ui/button';
import { Spinner } from '../components/ui/spinner';
import { MiniMap } from '../components/MiniMap';
import { driveMapsUrl, formatDriveDate } from '../lib/drives';

/**
 * The page a drive's share link opens (?drive=<id>). The planting drive schedule is for team members
 * and admins, so you have to be signed in with one of those roles; anyone else is told why.
 */
export const SharedDrivePage: React.FC<{ driveId: string }> = ({ driveId }) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [drive, setDrive] = useState<Drive | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'signin' | 'forbidden'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    // This page isn't inside the map app, so it sets up the sign-in token for API calls itself
    setAuthTokenGetter(isSignedIn ? getToken : null);
    setState('loading');
    getDriveById(driveId).then(
      (res) => {
        if (res.success) {
          setDrive(res.data);
          setState('ready');
          document.title = `${res.data.title} · Earth Revival Initiative`;
        } else setState('missing');
      },
      (err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setState(status === 401 ? 'signin' : status === 403 ? 'forbidden' : 'missing');
      }
    );
    // getToken is stable for a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveId, isLoaded, isSignedIn]);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: drive?.title, url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share sheet dismissed
    }
  };

  const maps = drive ? driveMapsUrl(drive) : null;
  const spot = drive && drive.latitude != null && drive.longitude != null ? { lat: drive.latitude, lng: drive.longitude } : null;

  return (
    <div className="min-h-dvh bg-background">
      <header className="pt-safe mx-auto flex max-w-xl items-center justify-between px-4 pb-3">
        <a href="/" aria-label="Earth Revival Initiative home">
          <Logo />
        </a>
        {drive && (
          <Button variant="secondary" onClick={share}>
            {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />} {copied ? 'Link copied' : 'Share'}
          </Button>
        )}
      </header>

      <main className="pb-safe mx-auto flex max-w-xl flex-col gap-6 px-4 pt-4">
        {state === 'loading' && (
          <div className="flex items-center gap-3 py-16 text-muted-foreground">
            <Spinner /> Loading the drive…
          </div>
        )}

        {state === 'signin' && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Sapling />
            <h1 className="text-3xl">Sign in to see this drive</h1>
            <p className="max-w-xs text-muted-foreground">Planting drives are shared with team members. Sign in with your team account to see the details.</p>
            <SignInButton mode="modal">
              <Button size="xl">Sign in</Button>
            </SignInButton>
          </div>
        )}

        {state === 'forbidden' && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Sapling />
            <h1 className="text-3xl">This drive is for the team</h1>
            <p className="max-w-xs text-muted-foreground">Planting drives can only be seen by team members and admins. If you should have access, ask an admin to add you to the team.</p>
            <a href="/" className={buttonClass('default', 'xl')}>Open the map</a>
          </div>
        )}

        {state === 'missing' && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Sapling />
            <h1 className="text-3xl">This drive isn't here</h1>
            <p className="max-w-xs text-muted-foreground">The link may be wrong, or the drive was removed. Ask whoever shared it for a new link.</p>
            <a href="/" className={buttonClass('default', 'xl')}>Open the map</a>
          </div>
        )}

        {drive && (
          <>
            <div className="flex flex-col gap-3">
              <Badge variant="drive" className="self-start">Planting drive</Badge>
              <h1 className="text-4xl leading-tight">{drive.title}</h1>
              <p className="flex items-center gap-2 text-lg">
                <Calendar className="size-5 text-muted-foreground" aria-hidden="true" /> {formatDriveDate(drive)}
              </p>
              {drive.address && (
                <p className="flex items-center gap-2 text-lg">
                  <MapPin className="size-5 text-muted-foreground" aria-hidden="true" /> {drive.address}
                </p>
              )}
            </div>

            {maps && (
              <a href={maps} target="_blank" rel="noopener noreferrer" className={buttonClass('default', 'xl', 'w-full')}>
                <ExternalLink aria-hidden="true" /> Get directions
              </a>
            )}

            <ExpandableText text={drive.description} lines={6} className="text-lg" />

            {spot && <MiniMap center={spot} pin={spot} liveRoom={`drive_${drive.id}`} className="h-80" />}

            <p className="pb-6 text-center text-sm text-muted-foreground">
              Organised by the <a href="/" className="underline underline-offset-4">Earth Revival Initiative</a>. Plant today, revive tomorrow.
            </p>
          </>
        )}
      </main>
    </div>
  );
};
