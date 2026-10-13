import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/react';
import { Radio } from 'lucide-react';
import { getSocket } from '../utils/socket';
import { Button } from './ui/button';
import { cn } from '../lib/cn';

/**
 * Shares your live location with everyone watching `room` while it's on.
 * Signed-in users only: the server ignores broadcasts without a verified session.
 */
export const LiveTracker: React.FC<{
  room: string;
  targetName: string;
  autoStart?: boolean;
  onStop?: () => void;
  className?: string;
}> = ({ room, targetName, autoStart, onStop, className }) => {
  const { isSignedIn } = useUser();
  const [watchId, setWatchId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const tracking = watchId !== null;

  const start = () => {
    setError(null);
    if (!isSignedIn) {
      setError('Sign in to share your walk.');
      return;
    }
    if (!navigator.geolocation) {
      setError("This browser can't share your location.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (position) => {
        getSocket().emit('send_location', {
          room,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp,
        });
      },
      () => {
        setError('Location is off. Allow location access and try again.');
        setWatchId(null);
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
    setWatchId(id);
  };

  const stop = () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    setWatchId(null);
    onStop?.();
  };

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      start();
    }
    // Start once when asked to
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Stop broadcasting when this unmounts
  useEffect(
    () => () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    },
    [watchId]
  );

  return (
    <div className={cn('flex items-center gap-3 rounded-2xl bg-card p-3 pl-4 shadow-float', className)} role="status">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', tracking ? 'bg-water text-white' : 'bg-secondary')}>
        <Radio className={cn('size-4', tracking && 'motion-safe:animate-pulse')} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{tracking ? 'Sharing your walk live' : 'Share your walk live'}</p>
        <p className={cn('truncate text-sm', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? (tracking ? `People following ${targetName} can see you` : `Let others see you walk to ${targetName}`)}
        </p>
      </div>
      {tracking ? (
        <Button variant="destructive" onClick={stop}>Stop</Button>
      ) : (
        <Button variant="secondary" onClick={start}>Start</Button>
      )}
    </div>
  );
};
