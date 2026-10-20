import { ExternalLink, Navigation } from 'lucide-react';
import type { LatLng } from '../../types';
import type { WalkRoute } from '../../lib/route';
import { formatDistance, formatMinutes } from '../../utils/geo';
import { Button, buttonClass } from '../ui/button';
import { Spinner } from '../ui/spinner';

// Within this distance we say you've arrived
export const ARRIVED_WITHIN_M = 20;

/** The forest card at the top while walking somewhere. */
export const NavigationCard: React.FC<{ name: string; remaining: number | null; locating: boolean }> = ({ name, remaining, locating }) => {
  const arrived = remaining !== null && remaining <= ARRIVED_WITHIN_M;
  return (
    <div className="top-safe pointer-events-auto fixed inset-x-4 z-[1000] flex items-center gap-3 rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground shadow-sheet md:right-auto md:left-[27rem] md:w-80" aria-live="polite">
      <Navigation className="size-6 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-heading text-xl leading-tight font-bold tabular-nums">
          {locating ? 'Finding you…' : arrived ? "You're here" : remaining !== null ? formatDistance(remaining) : 'On your way'}
        </p>
        <p className="truncate text-sm opacity-85">{arrived ? `${name} should be right next to you` : `Walk to ${name}`}</p>
      </div>
    </div>
  );
};

/** The sheet's content while navigating: time, distance, End and Google Maps. */
export const NavigationPanel: React.FC<{
  name: string;
  destination: LatLng;
  route: WalkRoute | null;
  loading: boolean;
  remaining: number | null;
  onEnd: () => void;
}> = ({ name, destination, route, loading, remaining, onEnd }) => {
  const meters = remaining ?? route?.meters ?? null;
  const minutes = meters !== null ? Math.max(1, Math.round(meters / 80)) : null;
  const arrive = minutes !== null ? new Date(Date.now() + minutes * 60_000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=walking`;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {loading && !route ? (
        <div className="flex items-center gap-3 py-2 text-muted-foreground">
          <Spinner /> Finding a walking route…
        </div>
      ) : (
        <div>
          <p className="flex items-baseline gap-2">
            <span className="font-heading text-4xl font-bold text-leaf tabular-nums">{minutes !== null ? formatMinutes(minutes) : '–'}</span>
            {meters !== null && <span className="font-heading text-2xl font-bold text-muted-foreground tabular-nums">{formatDistance(meters)}</span>}
          </p>
          <p className="mt-1 truncate text-muted-foreground">
            {arrive ? `Arrive ${arrive}, ` : ''}
            {name}
          </p>
          {route?.approximate && <p className="mt-1 text-sm text-muted-foreground">Straight-line distance. Follow the paths you can see.</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="danger" size="xl" onClick={onEnd}>End</Button>
        <a href={google} target="_blank" rel="noopener noreferrer" className={buttonClass('outline', 'xl')}>
          <ExternalLink aria-hidden="true" /> Google Maps
        </a>
      </div>
    </div>
  );
};
