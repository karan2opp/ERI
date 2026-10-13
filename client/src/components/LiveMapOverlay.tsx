import { useEffect, useState } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { getSocket } from '../utils/socket';

interface LiveLocation {
  userId: string;
  userName: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

const WALKER_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4" r="2"/><path d="m9 20 3-6 3 3v4"/><path d="m6 8 3-2 3 1 2 3h3"/><path d="m11 13-2 7"/></svg>';

const walkerIcon = L.divIcon({
  html: `<div class="pt-walker">${WALKER_SVG}</div>`,
  className: 'pt-marker',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Walkers who stop sending updates disappear after this long
const STALE_AFTER_MS = 30_000;

/** Shows everyone sharing their walk in a tracking room (plant_<id> or drive_<id>). */
export const LiveMapOverlay = ({ room }: { room: string }) => {
  const [trackers, setTrackers] = useState<Record<string, LiveLocation>>({});

  useEffect(() => {
    if (!room) return;

    const socket = getSocket();

    // Rooms are per-connection on the server, so rejoin whenever the socket reconnects (e.g. after sign-in).
    const joinRoom = () => socket.emit('join_tracking', room);
    joinRoom();
    socket.on('connect', joinRoom);

    const handleLocation = (data: LiveLocation) => {
      setTrackers((prev) => {
        if (prev[data.userId] && prev[data.userId].timestamp > data.timestamp) return prev;
        return { ...prev, [data.userId]: data };
      });
    };
    socket.on('receive_location', handleLocation);

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setTrackers((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          if (now - next[key].timestamp > STALE_AFTER_MS) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10_000);

    return () => {
      socket.off('receive_location', handleLocation);
      socket.off('connect', joinRoom);
      socket.emit('leave_tracking', room);
      clearInterval(cleanupInterval);
      setTrackers({});
    };
  }, [room]);

  return (
    <>
      {Object.values(trackers).map((t) => (
        <Marker key={t.userId} position={[t.latitude, t.longitude]} icon={walkerIcon} zIndexOffset={800}>
          <Tooltip direction="top" offset={[0, -14]}>
            {t.userName} is walking here
          </Tooltip>
        </Marker>
      ))}
    </>
  );
};
