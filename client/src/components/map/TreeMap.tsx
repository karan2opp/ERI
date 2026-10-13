import { useEffect } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Tree, Drive, LatLng } from '../../types';
import { treeStatus, type TreeStatus } from '../../lib/trees';
import { useIsDark, useThemeColors } from '../../lib/theme';
import type { TileSource } from '../../lib/tiles';
import { GoogleCredit } from './MapCredit';
import { LiveMapOverlay } from '../LiveMapOverlay';

export interface FlyToTarget extends LatLng {
  zoom?: number;
  /** Changes every request, so asking twice for the same spot still moves the map. */
  timestamp: number;
}

// Inline SVGs (lucide shapes) so pins render without React inside Leaflet's DOM.
const TREE_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z"/><path d="M12 19v3"/></svg>';
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

const pinIcon = (status: TreeStatus | 'drive', selected: boolean, label: string) => {
  const key = `${status}-${selected}-${label}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon =
      status === 'thirsty'
        ? L.divIcon({ html: waterDropPin(selected, label), className: 'pt-marker', iconSize: [40, 46], iconAnchor: [20, 30] })
        : L.divIcon({
            html: `<div class="pt-pin" role="button" aria-label="${label}" data-status="${status}" data-selected="${selected}">${status === 'drive' ? SPROUT_SVG : TREE_SVG}</div>`,
            className: 'pt-marker',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
    iconCache.set(key, icon);
  }
  return icon;
};

const youIcon = L.divIcon({ html: '<div class="pt-you" aria-label="Your location"><span></span></div>', className: 'pt-marker', iconSize: [40, 40], iconAnchor: [20, 20] });


const isPhone = () => window.innerWidth < 768;

/**
 * Where to centre the map so `target` lands in the middle of the part you can see:
 * above the bottom sheet on phones, right of the side panel on wider screens.
 */
function visibleCenter(map: L.Map, target: LatLng, zoom: number): L.LatLng {
  const point = map.project([target.lat, target.lng], zoom);
  const shift = isPhone() ? L.point(0, window.innerHeight * 0.23) : L.point(-208, 0);
  return map.unproject(point.add(shift), zoom);
}

const CameraController: React.FC<{ flyTo: FlyToTarget | null; route: [number, number][] | null }> = ({ flyTo, route }) => {
  const map = useMap();

  useEffect(() => {
    if (!flyTo) return;
    const zoom = flyTo.zoom ?? Math.max(map.getZoom(), 16);
    map.flyTo(visibleCenter(map, flyTo, zoom), zoom, { duration: 0.8 });
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

const MapEvents: React.FC<{ pickMode: boolean; onCenterChange?: (c: LatLng) => void; onMapClick?: () => void }> = ({
  pickMode,
  onCenterChange,
  onMapClick,
}) => {
  const map = useMapEvents({
    move() {
      if (pickMode && onCenterChange) {
        const c = map.getCenter();
        onCenterChange({ lat: c.lat, lng: c.lng });
      }
    },
    click() {
      if (!pickMode) onMapClick?.();
    },
  });

  // Report the starting centre as soon as pick mode begins
  useEffect(() => {
    if (pickMode && onCenterChange) {
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    }
  }, [pickMode]);

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

export interface TreeMapProps {
  trees: Tree[];
  selectedTreeId: string | null;
  onSelectTree: (tree: Tree) => void;
  drive: Drive | null;
  onSelectDrive: () => void;
  driveSelected: boolean;
  userLocation: LatLng | null;
  radiusMeters: number | null;
  route: [number, number][] | null;
  flyTo: FlyToTarget | null;
  pickMode: boolean;
  onCenterChange?: (center: LatLng) => void;
  onMapClick?: () => void;
  liveRoom: string | null;
  initialCenter: LatLng;
  initialZoom?: number;
  /** null while we're still finding out which tiles to use */
  tiles: TileSource | null;
}

export const TreeMap: React.FC<TreeMapProps> = ({
  trees,
  selectedTreeId,
  onSelectTree,
  drive,
  onSelectDrive,
  driveSelected,
  userLocation,
  radiusMeters,
  route,
  flyTo,
  pickMode,
  onCenterChange,
  onMapClick,
  liveRoom,
  initialCenter,
  initialZoom = 15,
  tiles,
}) => {
  const dark = useIsDark();
  const colors = useThemeColors();

  return (
    // isolate: Leaflet's panes use z-index up to 1000; keep them in their own stacking context
    <div className={`fixed inset-0 isolate bg-map ${dark && tiles?.invertInDark ? 'pt-tiles-invert' : ''}`}>
      <MapContainer center={[initialCenter.lat, initialCenter.lng]} zoom={initialZoom} zoomControl={false} className="h-full w-full">
        {tiles && <TileLayer key={tiles.url} url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} maxNativeZoom={tiles.maxZoom} subdomains={tiles.subdomains} />}

        <CameraController flyTo={flyTo} route={route} />
        <MapEvents pickMode={pickMode} onCenterChange={onCenterChange} onMapClick={onMapClick} />

        {userLocation && radiusMeters && (
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={radiusMeters}
            pathOptions={{ color: colors.leaf, fillColor: colors.primary, fillOpacity: 0.08, weight: 2, dashArray: '6 8' }}
          />
        )}

        {route && <Route line={route} />}

        {!pickMode &&
          trees.map((tree) => (
            <Marker
              key={tree.id}
              position={[tree.latitude, tree.longitude]}
              icon={pinIcon(treeStatus(tree), tree.id === selectedTreeId, tree.name)}
              zIndexOffset={tree.id === selectedTreeId ? 500 : 0}
              eventHandlers={{ click: () => onSelectTree(tree) }}
              keyboard
              title={tree.name}
            />
          ))}

        {!pickMode && drive?.latitude != null && drive.longitude != null && (
          <Marker
            position={[drive.latitude, drive.longitude]}
            icon={pinIcon('drive', driveSelected, drive.title)}
            zIndexOffset={400}
            eventHandlers={{ click: onSelectDrive }}
            title={drive.title}
          />
        )}

        {liveRoom && <LiveMapOverlay room={liveRoom} />}

        {/* You draw above the pins but let taps through to the pin underneath */}
        {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={youIcon} interactive={false} zIndexOffset={1000} />}
      </MapContainer>
      {/* On wider screens the credit sits beside the side panel; on phones the sheet carries it */}
      {tiles?.google && <GoogleCredit dark={dark} className="fixed bottom-2 left-[26.5rem] z-[500] max-md:hidden" />}
    </div>
  );
};
