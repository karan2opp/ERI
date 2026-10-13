/**
 * Seeds demo trees with realistic care histories: `npm run db:seed`
 *
 * - Two demo volunteer accounts own the trees (ids start with "seed_"), so real users' data is
 *   never touched. Running it again deletes the previous demo trees (and their care logs) first.
 * - 20 trees: half around Connaught Place, New Delhi, half around Pehowa, Haryana.
 * - Planting dates range from a few days to about three years ago, including trees whose
 *   planting anniversary ("birthday") is coming up or just passed.
 * - Each tree gets a care history from its planting day until now: regular watering, plus
 *   feeding, pruning and checks. A few trees haven't been watered for days, so they need water.
 * The randomness is seeded, so every run produces the same trees.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../common/db';
import { users, trees, careLogs, type NewCareLog } from '../common/db/schema';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const SEED_USERS = [
  { id: 'seed_eri_volunteers', email: 'volunteers@demo.earthrevival.org', name: 'ERI Volunteers' },
  { id: 'seed_eri_school', email: 'greenclub@demo.earthrevival.org', name: 'Green School Club' },
];

// Small seeded random generator so every run is identical
let state = 20261014;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min: number, max: number) => min + rand() * (max - min);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const PHOTOS = [
  'photo-1542273917363-3b1817f69a2d',
  'photo-1502082553048-f009c37129b9',
  'photo-1448375240586-882707db888b',
  'photo-1513836279014-a89f7a76ae86',
  'photo-1522383225653-ed111181a951',
].map((id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=80`);

const PLACES = {
  delhi: { lat: 28.6315, lng: 77.2167, area: 'Connaught Place, New Delhi' },
  pehowa: { lat: 29.9786, lng: 76.5862, area: 'Pehowa, Haryana' },
};

// name, species, landmark, place, age in days, days since last watered (null = cared for regularly)
const TREES: [string, string, string, keyof typeof PLACES, number, number | null][] = [
  ['Neem by Hanuman Mandir', 'Neem (Azadirachta indica)', 'Baba Kharak Singh Marg', 'delhi', 1088, null],
  ['Peepal at the bus stop', 'Peepal (Ficus religiosa)', 'Janpath bus stop', 'delhi', 731, null], // turned 2 yesterday
  ['Jamun in Central Park', 'Jamun (Syzygium cumini)', 'Central Park, Rajiv Chowk', 'delhi', 360, 4], // turns 1 in 5 days
  ['Ashoka row, Barakhamba Road', 'Ashoka (Saraca asoca)', 'Barakhamba Road', 'delhi', 540, null],
  ['Gulmohar outside the metro', 'Gulmohar (Delonix regia)', 'Rajiv Chowk metro, gate 7', 'delhi', 190, 6],
  ['Banyan sapling, Hailey Road', 'Banyan (Ficus benghalensis)', 'Hailey Road corner', 'delhi', 95, null],
  ['Mango in the school yard', 'Mango (Mangifera indica)', 'Modern School, Barakhamba', 'delhi', 45, null],
  ['Neem saplings, Jantar Mantar', 'Neem (Azadirachta indica)', 'Jantar Mantar Road', 'delhi', 12, 3],
  ['Jacaranda by Shivaji Stadium', 'Jacaranda (Jacaranda mimosifolia)', 'Shivaji Stadium gate', 'delhi', 3, null],
  ['Peepal at Bangla Sahib', 'Peepal (Ficus religiosa)', 'Ashoka Road', 'delhi', 820, null],
  ['Neem at Model Town Park', 'Neem (Azadirachta indica)', 'Model Town Park', 'pehowa', 1000, null],
  ['Banyan by Saraswati Tirth', 'Banyan (Ficus benghalensis)', 'Saraswati Tirth ghat', 'pehowa', 1460, null], // 4 years old
  ['Jamun row, Gandhi Nagar', 'Jamun (Syzygium cumini)', 'Gandhi Nagar main road', 'pehowa', 400, 9],
  ['Mango at the bus stand', 'Mango (Mangifera indica)', 'Pehowa bus stand', 'pehowa', 250, null],
  ['Ashoka by the hospital', 'Ashoka (Saraca asoca)', 'Saraswati Mission Hospital', 'pehowa', 130, null],
  ['Gulmohar on Kurukshetra Road', 'Gulmohar (Delonix regia)', 'Kurukshetra Road', 'pehowa', 60, 5],
  ['Peepal at the school gate', 'Peepal (Ficus religiosa)', 'Government School gate', 'pehowa', 21, null],
  ['Neem saplings, drive 1', 'Neem (Azadirachta indica)', 'Model Town Park, east side', 'pehowa', 8, null],
  ['Jamun by the canal', 'Jamun (Syzygium cumini)', 'Canal road', 'pehowa', 366, 3], // turned 1 yesterday
  ['Banyan at the chowk', 'Banyan (Ficus benghalensis)', 'Main chowk', 'pehowa', 1, null],
];

const WATER_NOTES = ['5 litres at the roots', 'Deep watering, soil was dry', 'Watered after the hot afternoon', 'Two buckets', null, null, null];
const FEED_NOTES = ['Compost around the base', 'Added cow-dung manure', 'Mulched with dry leaves'];
const PRUNE_NOTES = ['Cut back dead branches', 'Trimmed low branches over the footpath'];
const CHECK_NOTES = ['New leaves coming in', 'Tree guard fixed', 'Looks healthy, no pests', 'Some yellow leaves, keep watering'];

/** A daylight time (6 am to 7 pm) on the same day as `ts`, moved back a day if that would be in the future. */
const daylight = (ts: number, now: Date) => {
  const d = new Date(ts);
  d.setHours(Math.floor(between(6, 19)), Math.floor(between(0, 60)), 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
};

/** Care from planting day until now. Young trees are watered often; older ones less often. */
function careHistory(treeId: string, plantedAt: Date, now: Date, lastWateredDaysAgo: number | null, performers: string[]) {
  const logs: NewCareLog[] = [];
  const stopWateringAt = lastWateredDaysAgo === null ? now.getTime() : now.getTime() - lastWateredDaysAgo * DAY;

  logs.push({ treeId, actionType: 'WATERED', notes: 'Planted and watered', userId: performers[0], performedAt: plantedAt });

  let t = plantedAt.getTime();
  let nextFeed = t + between(40, 70) * DAY;
  let nextPrune = t + between(100, 160) * DAY;
  let nextCheck = t + between(20, 35) * DAY;
  while (true) {
    const ageDays = (t - plantedAt.getTime()) / DAY;
    // Saplings: every 2-4 days for the first 3 months, then every 5-10 days
    t += (ageDays < 90 ? between(2, 4) : between(5, 10)) * DAY;
    if (t >= stopWateringAt) break;
    // Care happens in daylight: between 6 am and 7 pm
    const at = new Date(t);
    at.setHours(Math.floor(between(6, 19)), Math.floor(between(0, 60)), 0, 0);
    if (at.getTime() >= stopWateringAt) break;
    logs.push({ treeId, actionType: 'WATERED', notes: pick(WATER_NOTES), userId: pick(performers), performedAt: at });

    if (t >= nextFeed) {
      logs.push({ treeId, actionType: 'FERTILIZED', notes: pick(FEED_NOTES), userId: pick(performers), performedAt: new Date(at.getTime() + HOUR) });
      nextFeed = t + between(50, 80) * DAY;
    }
    if (t >= nextPrune) {
      logs.push({ treeId, actionType: 'PRUNED', notes: pick(PRUNE_NOTES), userId: pick(performers), performedAt: new Date(at.getTime() + 2 * HOUR) });
      nextPrune = t + between(120, 180) * DAY;
    }
    if (t >= nextCheck) {
      logs.push({ treeId, actionType: 'INSPECTED', notes: pick(CHECK_NOTES), userId: pick(performers), performedAt: new Date(at.getTime() + 30 * 60 * 1000) });
      nextCheck = t + between(25, 40) * DAY;
    }
  }

  // Well-looked-after trees were watered within the last day or so (so they don't show as needing water)
  if (lastWateredDaysAgo === null && now.getTime() - plantedAt.getTime() > 2 * DAY) {
    logs.push({
      treeId,
      actionType: 'WATERED',
      notes: pick(WATER_NOTES),
      userId: pick(performers),
      performedAt: daylight(now.getTime() - between(2, 30) * HOUR, now),
    });
  }

  // Trees that need water may still have had a recent check (care, but not watering)
  if (lastWateredDaysAgo !== null && lastWateredDaysAgo > 4) {
    logs.push({
      treeId,
      actionType: 'INSPECTED',
      notes: 'Soil is dry, needs water soon',
      userId: pick(performers),
      performedAt: daylight(now.getTime() - between(1, 2) * DAY, now),
    });
  }
  return logs.sort((a, b) => a.performedAt!.getTime() - b.performedAt!.getTime());
}

async function main() {
  const now = new Date();
  const seedIds = SEED_USERS.map((u) => u.id);

  // Demo owners (kept between runs), and a clean slate for their trees
  for (const u of SEED_USERS) {
    await db
      .insert(users)
      .values({ ...u, avatarUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${u.id}` })
      .onConflictDoNothing();
  }
  const removed = await db.delete(trees).where(inArray(trees.userId, seedIds)).returning({ id: trees.id });

  let logCount = 0;
  for (const [i, [name, species, landmark, placeKey, ageDays, lastWateredDaysAgo]] of TREES.entries()) {
    const place = PLACES[placeKey];
    // Planted at a daytime hour, ageDays ago
    const plantedAt = new Date(now.getTime() - ageDays * DAY);
    plantedAt.setHours(Math.floor(between(7, 17)), Math.floor(between(0, 60)), 0, 0);
    if (plantedAt > now) plantedAt.setTime(now.getTime() - 2 * HOUR);

    const owner = SEED_USERS[i % 2].id;
    const [tree] = await db
      .insert(trees)
      .values({
        name,
        species,
        description: `${species.split(' (')[0]} planted by ${SEED_USERS[i % 2].name}. Demo data for trying out the app.`,
        photoUrl: PHOTOS[i % PHOTOS.length],
        latitude: place.lat + between(-0.011, 0.011),
        longitude: place.lng + between(-0.011, 0.011),
        address: `${landmark}, ${place.area}`,
        healthScore: lastWateredDaysAgo === null ? Math.round(between(82, 100)) : Math.round(between(52, 72)),
        plantedAt,
        userId: owner,
        createdAt: plantedAt,
        updatedAt: now,
      })
      .returning();

    const logs = careHistory(tree.id, plantedAt, now, lastWateredDaysAgo, seedIds);
    for (let k = 0; k < logs.length; k += 200) await db.insert(careLogs).values(logs.slice(k, k + 200));
    logCount += logs.length;

    const lastWatered = [...logs].reverse().find((l) => l.actionType === 'WATERED')?.performedAt ?? null;
    const lastCared = logs[logs.length - 1]?.performedAt ?? null;
    await db.update(trees).set({ lastWateredAt: lastWatered, lastCaredAt: lastCared }).where(eq(trees.id, tree.id));
  }

  console.log(`Removed ${removed.length} old demo trees. Added ${TREES.length} demo trees with ${logCount} care log entries.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
