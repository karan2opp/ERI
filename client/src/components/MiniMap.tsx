import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from '../types';
import { useIsDark } from '../lib/theme';
import { useTileSource } from '../lib/tiles';
import { GoogleCredit } from './map/MapCredit';
import { LiveMapOverlay } from './LiveMapOverlay';


const SPROUT_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>';
const BIN_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></svg>';
const pinFor = (cleanup: boolean) =>
  L.divIcon({ html: `<div class="pt-pin" data-status="${cleanup ? 'cleanup' : 'drive'}">${cleanup ? BIN_SVG : SPROUT_SVG}</div>`, className: 'pt-marker', iconSize: [36, 36], iconAnchor: [18, 18] });
const drivePin = pinFor(false);
const cleanupPin = pinFor(true);

const Recenter: React.FC<{ center: LatLng; zoom: number; token: number }> = ({ center, zoom, token }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], zoom);
    // Only move when asked (token changes), not on every centre report
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return null;
};

const CenterReporter: React.FC<{ onCenterChange: (c: LatLng) => void }> = ({ onCenterChange }) => {
  const map = useMapEvents({
    moveend() {
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
};

/**
 * A small embedded map. With `onCenterChange` it's a location picker (the pin stays in the
 * middle and you move the map); with `pin` it shows a drive; with `liveRoom` it shows walkers.
 */
export const MiniMap: React.FC<{
  center: LatLng;
  zoom?: number;
  recenterToken?: number;
  onCenterChange?: (c: LatLng) => void;
  pin?: LatLng | null;
  /** A clean-up drive's pin is purple with a bin instead of a brown sprout */
  pinCleanup?: boolean;
  liveRoom?: string;
  className?: string;
}> = ({ center, zoom = 15, recenterToken = 0, onCenterChange, pin, pinCleanup, liveRoom, className }) => {
  const dark = useIsDark();
  const tiles = useTileSource(dark);
  return (
    <div className={`relative isolate overflow-hidden rounded-2xl bg-map ${dark && tiles?.invertInDark ? 'pt-tiles-invert' : ''} ${className ?? 'h-72'}`}>
      <MapContainer center={[center.lat, center.lng]} zoom={zoom} zoomControl={false} className="h-full w-full">
        {tiles && <TileLayer key={tiles.url} url={tiles.url} attribution={tiles.attribution} subdomains={tiles.subdomains} maxZoom={tiles.maxZoom} maxNativeZoom={tiles.maxZoom} />}
        <Recenter center={center} zoom={zoom} token={recenterToken} />
        {onCenterChange && <CenterReporter onCenterChange={onCenterChange} />}
        {pin && <Marker position={[pin.lat, pin.lng]} icon={pinCleanup ? cleanupPin : drivePin} interactive={false} />}
        {liveRoom && <LiveMapOverlay room={liveRoom} />}
      </MapContainer>
      {tiles?.google && <GoogleCredit dark={dark} className="absolute bottom-2 left-2 z-[1000]" />}
      {onCenterChange && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1000] -translate-x-1/2 -translate-y-full" aria-hidden="true">
          <svg viewBox="0 0 40 52" className="h-11 w-8 drop-shadow-md">
            <path d="M20 51C20 51 38 31.5 38 19A18 18 0 0 0 2 19C2 31.5 20 51 20 51Z" className="fill-bark stroke-background" strokeWidth="3" />
            <circle cx="20" cy="19" r="6.5" className="fill-background" />
          </svg>
        </div>
      )}
    </div>
  );
};
