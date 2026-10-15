import type { LatLng, Tree } from '../types';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/**
 * Sample trees shown around `center` only while the server has no trees (or can't be reached),
 * so a first visit isn't an empty map. Their ids start with "demo-", which the UI labels
 * as samples and never sends to the API.
 */
export const sampleTreesAround = (center: LatLng): Tree[] => {
  const sample = (
    n: number,
    dLat: number,
    dLng: number,
    name: string,
    species: string,
    photo: string,
    wateredHoursAgo: number,
    health: number
  ): Tree => ({
    id: `demo-${n}`,
    name,
    species,
    description: 'A sample tree. Plant a real one and it replaces these for everyone.',
    photoUrl: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=800&q=70`,
    latitude: center.lat + dLat,
    longitude: center.lng + dLng,
    address: '',
    healthScore: health,
    plantedAt: hoursAgo(24 * 30 * n + 5),
    lastWateredAt: hoursAgo(wateredHoursAgo),
    lastCaredAt: hoursAgo(wateredHoursAgo),
    waterEveryDays: 7,
    fertilizeEveryDays: 60,
    weedEveryDays: 30,
    userId: 'demo',
    owner: { id: 'demo', name: 'Earth Revival Initiative', email: '' },
    createdAt: hoursAgo(24 * n),
    updatedAt: hoursAgo(24 * n),
  });

  return [
    sample(1, 0.0004, 0.0003, 'Neem by the corner shop', 'Neem (Azadirachta indica)', 'photo-1542273917363-3b1817f69a2d', 4, 92),
    sample(2, -0.001, 0.0007, 'Gulmohar at the bus stop', 'Gulmohar (Delonix regia)', 'photo-1522383225653-ed111181a951', 55, 58),
    sample(3, 0.0031, -0.0024, 'Old banyan on the main road', 'Banyan (Ficus benghalensis)', 'photo-1502082553048-f009c37129b9', 14, 88),
    sample(4, -0.0062, -0.0035, 'Jamun in the park', 'Jamun (Syzygium cumini)', 'photo-1448375240586-882707db888b', 72, 64),
  ];
};
