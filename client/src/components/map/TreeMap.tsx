import { useEffect, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Drive, LatLng } from '../../types';
import type { TreeStatus } from '../../lib/trees';
import type { PinCluster, PinsResult, TreePin } from '../../services/api';
import type { MapView } from '../../lib/pins';
import { useIsDark, useThemeColors } from '../../lib/theme';
import type { TileSource } from '../../lib/tiles';
import { GoogleCredit } from './MapCredit';
import { LiveMapOverlay } from '../LiveMapOverlay';
import { Spinner } from '../ui/spinner';

export interface FlyToTarget extends LatLng {
  zoom?: number;
  /** Jump straight there instead of flying (a fly loads tiles at every zoom level on the way) */
  instant?: boolean;
  /** Changes every request, so asking twice for the same spot still moves the map. */
  timestamp: number;
}

// Inline SVGs (lucide shapes) so pins render without React inside Leaflet's DOM.
const TREE_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z"/><path d="M12 19v3"/></svg>';
const BIN_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></svg>';
const SPROUT_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>';

// Leaflet positions the marker element with `transform`, so it stays unstyled (.pt-marker) and all
// the look, including the grow-when-selected scale, lives on the inner .pt-pin.
const iconCache = new Map<string, L.DivIcon>();

// A blue water drop (lucide "droplet" outline) with the tree drawn inside its round part
const waterDropPin = (selected: boolean, label: string) =>
  `<svg class="pt-droppin" viewBox="0 0 24 24" role="button" aria-label="${label}, needs water" data-selected="${selected}">` +
  '<path class="pt-drop-body" d="M12 22.6a7.6 7.6 0 0 0 7.6-7.6c0-2.2-1.1-4.2-3.2-5.9S12.6 4.8 12 1.6c-.6 2.7-2.2 5.3-4.4 7.1C5.5 10.6 4.4 12.8 4.4 15a7.6 7.6 0 0 0 7.6 7.6z"/>' +
  '<g transform="translate(7.4 10.2) scale(0.385)" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z"/><path d="M12 19v3"/></g></svg>';

const pinIcon = (status: TreeStatus | 'drive' | 'cleanup', selected: boolean, label: string) => {
  const key = `${status}-${selected}-${label}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon =
      status === 'thirsty'
        ? L.divIcon({ html: waterDropPin(selected, label), className: 'pt-marker', iconSize: [40, 46], iconAnchor: [20, 30] })
        : L.divIcon({
            html: `<div class="pt-pin" role="button" aria-label="${label}" data-status="${status}" data-selected="${selected}">${status === 'drive' ? SPROUT_SVG : status === 'cleanup' ? BIN_SVG : TREE_SVG}</div>`,
            className: 'pt-marker',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
    iconCache.set(key, icon);
  }
  return icon;
};

/**
 * You: a red dot with a white ring and a pulse, and (when we know which way you face) a cone that
 * points that way. The icon is rebuilt only when the heading moves by a few degrees.
 */
const youIconCache = new Map<number, L.DivIcon>();
const youIcon = (heading: number | null) => {
  const key = heading === null ? -1 : Math.round(heading / 5) * 5;
  let icon = youIconCache.get(key);
  if (!icon) {
    const cone = key >= 0 ? `<span class="pt-you-cone" style="--heading:${key}deg"></span>` : '';
    icon = L.divIcon({
      html: `<div class="pt-you" role="img" aria-label="Your location"><span class="pt-you-pulse"></span>${cone}<span class="pt-you-dot"></span></div>`,
      className: 'pt-marker',
      iconSize: [72, 72],
      iconAnchor: [36, 36],
    });
    youIconCache.set(key, icon);
  }
  return icon;
};

// Show the accuracy circle only when it's wide enough to mean something and not absurdly wide
const MIN_ACCURACY_CIRCLE_M = 15;
const MAX_ACCURACY_CIRCLE_M = 1500;


const isPhone = () => window.innerWidth < 768;

/**
 * Where to centre the map so `target` lands in the middle of the part you can see:
 * above the bottom sheet on phones, right of the side panel on wider screens.
 */
function visibleCenter(target: LatLng, zoom: number): L.LatLng {
  // Same projection as the map, so this also works before the map exists (for its first view)
  const crs = L.CRS.EPSG3857;
  const point = crs.latLngToPoint(L.latLng(target.lat, target.lng), zoom);
  const shift = isPhone() ? L.point(0, window.innerHeight * 0.23) : L.point(-208, 0);
  return crs.pointToLatLng(point.add(shift), zoom);
}

const CameraController: React.FC<{ flyTo: FlyToTarget | null; route: [number, number][] | null }> = ({ flyTo, route }) => {
  const map = useMap();

  useEffect(() => {
    if (!flyTo) return;
    const zoom = flyTo.zoom ?? Math.max(map.getZoom(), 16);
    if (flyTo.instant) map.setView(visibleCenter(flyTo, zoom), zoom, { animate: false });
    else map.flyTo(visibleCenter(flyTo, zoom), zoom, { duration: 0.8 });
  }, [flyTo?.timestamp, map]);

  // Show the whole walk once a route arrives
  useEffect(() => {
    if (!route || route.length < 2) return;
    const phone = isPhone();
    map.fitBounds(L.latLngBounds(route), {
      paddingTopLeft: phone ? [24, 140] : [440, 80],
      paddingBottomRight: phone ? [24, window.innerHeight * 0.36] : [80, 80],
      maxZoom: 17,
    });
  }, [route, map]);

  return null;
};

const MapEvents: React.FC<{
  onMapClick?: () => void;
  onViewChange?: (view: MapView) => void;
}> = ({ onMapClick, onViewChange }) => {
  const map = useMapEvents({
    click() {
      onMapClick?.();
    },
  });

  // Once the map stops moving, say what's in view, so the right pins load (and once at the start).
  // Attached once with the latest callback in a ref: re-attaching on every render could miss a move
  // made in the same update, like the jump to your first location.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  useEffect(() => {
    const report = () => {
      const b = map.getBounds();
      onViewChangeRef.current?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: map.getZoom() });
    };
    map.on('moveend', report);
    report();
    return () => {
      map.off('moveend', report);
    };
  }, [map]);

  return null;
};

// The route: a leaf-green line on a background casing, so it inverts with the rest of the UI
const Route: React.FC<{ line: [number, number][] }> = ({ line }) => {
  const colors = useThemeColors();
  return (
    <>
      <Polyline positions={line} pathOptions={{ color: colors.background, weight: 11, lineCap: 'round', lineJoin: 'round', opacity: 1 }} />
      <Polyline positions={line} pathOptions={{ color: colors.leaf, weight: 6, lineCap: 'round', lineJoin: 'round', opacity: 1 }} />
    </>
  );
};

// A bubble for several trees: the count, plus how many of them need water
const clusterIcon = (count: number, thirsty: number) =>
  L.divIcon({
    html:
      `<div class="pt-cluster" data-size="${count >= 1000 ? 'l' : count >= 100 ? 'm' : 's'}" role="button" aria-label="${count} trees${thirsty ? `, ${thirsty} need water` : ''}. Zoom in">` +
      `<span>${count >= 10000 ? Math.round(count / 1000) + 'k' : count}</span>` +
      (thirsty ? `<span class="pt-cluster-water">${thirsty >= 1000 ? Math.round(thirsty / 1000) + 'k' : thirsty}</span>` : '') +
      '</div>',
    className: 'pt-marker',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });

const TreePinMarker: React.FC<{ pin: TreePin; selected: boolean; onSelect: (pin: TreePin) => void }> = ({ pin, selected, onSelect }) => (
  <Marker
    position={[pin.lat, pin.lng]}
    icon={pinIcon(pin.needsWater ? 'thirsty' : 'healthy', selected, pin.name)}
    zIndexOffset={selected ? 500 : 0}
    eventHandlers={{ click: () => onSelect(pin) }}
    keyboard
    title={pin.name}
  />
);

/** Tapping a cluster zooms in on it, two levels at a time. */
const ClusterMarker: React.FC<{ cluster: PinCluster }> = ({ cluster }) => {
  const map = useMap();
  return (
    <Marker
      position={[cluster.lat, cluster.lng]}
      icon={clusterIcon(cluster.count, cluster.thirsty)}
      // Centred in the part of the map you can see (above the sheet on phones)
      eventHandlers={{
        click: () => {
          const zoom = Math.min(map.getZoom() + 2, 18);
          map.setView(visibleCenter(cluster, zoom), zoom);
        },
      }}
      // Above your own location dot, so the count stays readable
      zIndexOffset={1100}
      keyboard
      title={`${cluster.count} trees`}
    />
  );
};

export interface TreeMapProps {
  /** What to draw: tree pins, or clusters when zoomed out (null while loading) */
  pins: PinsResult | null;
  selectedTreeId: string | null;
  /** The selected tree, drawn even when it is inside a cluster */
  selectedPin?: TreePin | null;
  onSelectTree: (pin: TreePin) => void;
  /** Called when the map stops moving, with what is in view */
  onViewChange?: (view: MapView) => void;
  /** Drives to pin (the upcoming ones, plus whichever is selected): brown sprouts for plantation drives, purple bins for clean-ups */
  drives: Drive[];
  selectedDriveId: string | null;
  onSelectDrive: (drive: Drive) => void;
  userLocation: LatLng | null;
  /** How precisely the phone knows where you are, in metres */
  userAccuracy?: number | null;
  /** Which way you're facing or moving, degrees clockwise from north */
  userHeading?: number | null;
  radiusMeters: number | null;
  route: [number, number][] | null;
  flyTo: FlyToTarget | null;
  onMapClick?: () => void;
  liveRoom: string | null;
  initialCenter: LatLng;
  initialZoom?: number;
  /** null while we're still finding out which tiles to use */
  tiles: TileSource | null;
  /**
   * False while we're still finding out where you are, so no tiles load for a place we're about to
   * leave (a first visit would otherwise load all of India, then your street)
   */
  loadTiles?: boolean;
  /** False until we know where you are (or gave up waiting): the loading card stays until then */
  located?: boolean;
}

export const TreeMap: React.FC<TreeMapProps> = ({
  pins,
  selectedTreeId,
  selectedPin = null,
  onSelectTree,
  onViewChange,
  drives,
  selectedDriveId,
  onSelectDrive,
  userLocation,
  userAccuracy = null,
  userHeading = null,
  radiusMeters,
  route,
  flyTo,
  onMapClick,
  liveRoom,
  initialCenter,
  initialZoom = 15,
  tiles,
  loadTiles = true,
  located = true,
}) => {
  const dark = useIsDark();
  const colors = useThemeColors();

  // Cover the map with a loading card until the first screenful of tiles is in. If tiles fail or
  // are very slow, give up on the card after a while so it never sits there for good.
  const [firstTilesIn, setFirstTilesIn] = useState(false);
  useEffect(() => {
    if (!loadTiles || firstTilesIn) return;
    const t = window.setTimeout(() => setFirstTilesIn(true), 15_000);
    return () => clearTimeout(t);
  }, [loadTiles, firstTilesIn]);
  const showTiles = Boolean(tiles) && loadTiles;

  // Individual pins: the tree pins, the single-tree cells of a cluster answer, and the selected tree
  // (so it stays visible even when its area is shown as a cluster)
  const treePins: TreePin[] = [];
  const clusters: PinCluster[] = [];
  if (pins?.kind === 'trees') treePins.push(...pins.data);
  else if (pins?.kind === 'clusters') {
    for (const c of pins.data) {
      if (c.count === 1 && c.id) treePins.push({ id: c.id, lat: c.lat, lng: c.lng, name: c.name ?? 'Tree', needsWater: c.thirsty > 0 });
      else clusters.push(c);
    }
  }
  if (selectedPin && !treePins.some((p) => p.id === selectedPin.id)) treePins.push(selectedPin);

  return (
    // isolate: Leaflet's panes use z-index up to 1000; keep them in their own stacking context
    <div className={`fixed inset-0 isolate bg-map ${dark && tiles?.invertInDark ? 'pt-tiles-invert' : ''}`}>
      {/* Open with the same view a location jump gives (you above the sheet), so the first GPS fix doesn't shift or zoom it */}
      <MapContainer center={visibleCenter(initialCenter, initialZoom)} zoom={initialZoom} zoomControl={false} className="h-full w-full">
        {showTiles && tiles && (
          <TileLayer
            key={tiles.url}
            url={tiles.url}
            attribution={tiles.attribution}
            maxZoom={tiles.maxZoom}
            maxNativeZoom={tiles.maxZoom}
            subdomains={tiles.subdomains}
            // Only the tiles for where the map ends up, not every zoom level it passes through
            updateWhenZooming={false}
            eventHandlers={{ load: () => setFirstTilesIn(true) }}
          />
        )}

        <CameraController flyTo={flyTo} route={route} />
        <MapEvents onMapClick={onMapClick} onViewChange={onViewChange} />

        {userLocation && radiusMeters && (
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={radiusMeters}
            pathOptions={{ color: colors.leaf, fillColor: colors.primary, fillOpacity: 0.08, weight: 2, dashArray: '6 8' }}
          />
        )}

        {route && <Route line={route} />}

        {treePins.map((pin) => <TreePinMarker key={pin.id} pin={pin} selected={pin.id === selectedTreeId} onSelect={onSelectTree} />)}
        {clusters.map((c) => <ClusterMarker key={`${c.lat},${c.lng},${c.count}`} cluster={c} />)}

        {drives.map(
            (d) =>
              d.latitude != null &&
              d.longitude != null && (
                <Marker
                  key={d.id}
                  position={[d.latitude, d.longitude]}
                  icon={pinIcon(d.type === 'CLEANUP' ? 'cleanup' : 'drive', d.id === selectedDriveId, d.title)}
                  zIndexOffset={d.id === selectedDriveId ? 600 : 400}
                  eventHandlers={{ click: () => onSelectDrive(d) }}
                  title={d.title}
                />
              )
          )}

        {liveRoom && <LiveMapOverlay room={liveRoom} />}

        {/* You draw above the pins but let taps through to the pin underneath */}
        {/* How sure the phone is of where you are: a soft circle that shrinks as the GPS settles */}
        {userLocation && userAccuracy !== null && userAccuracy >= MIN_ACCURACY_CIRCLE_M && userAccuracy <= MAX_ACCURACY_CIRCLE_M && (
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={userAccuracy}
            interactive={false}
            pathOptions={{ color: colors.you, weight: 1, opacity: 0.5, fillColor: colors.you, fillOpacity: 0.14 }}
          />
        )}
        {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={youIcon(userHeading)} interactive={false} zIndexOffset={1000} />}
      </MapContainer>
      {/* 1. Finding you: the map stays covered (tiles keep loading underneath), so it never shows somewhere else first */}
      {!located && (
        <div className="absolute inset-0 z-[450] flex items-start justify-center bg-map px-4 pt-[30vh] md:pl-[26rem]">
          <div role="status" className="flex items-center gap-3 rounded-full bg-card px-5 py-3 font-medium shadow-float">
            <Spinner className="size-5" />
            Finding where you are…
          </div>
        </div>
      )}
      {/* 2. Found you, tiles still coming in: the map shows, with a small card on top */}
      {located && !firstTilesIn && (
        // pointer-events-none: the map and its controls keep working underneath
        <div className="pointer-events-none absolute inset-x-0 top-[30%] z-[450] flex justify-center px-4 md:left-[26rem]">
          <div role="status" className="flex items-center gap-3 rounded-full bg-card px-5 py-3 font-medium shadow-float">
            <Spinner className="size-5" />
            Loading the map…
          </div>
        </div>
      )}
      {/* On wider screens the credit sits beside the side panel; on phones the sheet carries it */}
      {tiles?.google && <GoogleCredit dark={dark} className="fixed bottom-2 left-[26.5rem] z-[500] max-md:hidden" />}
    </div>
  );
};
