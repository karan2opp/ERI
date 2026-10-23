import { useEffect, useRef, useState } from 'react';
import { Recycle, Sprout, Trash2, Trees } from 'lucide-react';
import { fetchSiteStats, type SiteStats } from '../../services/api';
import { cn } from '../../lib/cn';

// The four impact numbers (trees planted, plantation and clean-up drives, waste collected), shared by the home
// and About pages. Each counts up from 0 when its box scrolls into view.

type Tone = 'leaf' | 'bark' | 'cleanup';

// Colour keeps its meaning from the map: leaf green for trees, brown for plantation, purple for clean-up
const TONE: Record<Tone, string> = {
  leaf: 'bg-leaf/12 text-leaf',
  bark: 'bg-bark/12 text-bark',
  cleanup: 'bg-cleanup/12 text-cleanup',
};

const IMPACT: { key: keyof SiteStats; label: string; note: string; icon: React.ReactNode; tone: Tone; unit?: string }[] = [
  { key: 'treesPlanted', label: 'Trees planted', note: 'Verified trees on the shared map', icon: <Trees />, tone: 'leaf' },
  { key: 'plantationDrives', label: 'Plantation drives', note: 'Volunteer days when new trees went in', icon: <Sprout />, tone: 'bark' },
  { key: 'cleanupDrives', label: 'Clean-up drives', note: 'Volunteer days clearing litter from our streets', icon: <Trash2 />, tone: 'cleanup' },
  { key: 'wasteCollectedKg', label: 'Waste collected', note: 'Litter taken off our streets and green spaces', icon: <Recycle />, tone: 'cleanup', unit: 'kg' },
];

/**
 * PLACEHOLDER NUMBERS. While this is true the four boxes show the sample numbers below, not real counts,
 * so they must be switched off before the site is shown to the public. Set it to false to show what the
 * server counts (waste collected comes from Admin > Settings).
 */
const SHOW_SAMPLE_NUMBERS = true;
const SAMPLE_NUMBERS: SiteStats = { treesPlanted: 1250, plantationDrives: 18, cleanupDrives: 12, wasteCollectedKg: 3400 };

/**
 * Counts up from 0 to `target` over about two seconds, easing out, once `start` is true (when the box is on screen).
 * Shows the final number at once if the person prefers less motion.
 */
function useCountUp(target: number | null, start: boolean, duration = 2000): number | null {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === null || !start) return;
    if (target === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const begun = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - begun) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, start, duration]);
  return target === null ? null : value;
}

/** One of the four boxes: a coloured icon, the big number (it counts up), what it counts and a line about it. */
const ImpactBox: React.FC<{ item: (typeof IMPACT)[number]; target: number | null }> = ({ item, target }) => {
  // Starts counting when the box scrolls into view, so it is seen counting even though it is below the picture
  const box = useRef<HTMLLIElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setSeen(true);
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          watcher.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);
  const value = useCountUp(target, seen);
  return (
  <li ref={box} className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-border md:p-5">
    <span className={cn('grid size-10 place-items-center rounded-lg [&>svg]:size-5', TONE[item.tone].split(' ')[0], TONE[item.tone].split(' ')[1])} aria-hidden="true">
      {item.icon}
    </span>
    <p className={cn('font-heading text-3xl font-extrabold tabular-nums md:text-4xl', TONE[item.tone].split(' ')[1])}>
      {value === null ? '–' : value.toLocaleString('en-IN')}
      {item.unit && value !== null && <span className="ml-1 text-lg font-bold">{item.unit}</span>}
    </p>
    <div>
      <h3 className="font-sans text-base font-semibold">{item.label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
    </div>
  </li>
  );
};

/** The four numbers from the server (or the placeholders while SHOW_SAMPLE_NUMBERS is true), or null while loading. */
function useImpactNumbers(): SiteStats | null {
  const [stats, setStats] = useState<SiteStats | null>(null);
  useEffect(() => {
    if (SHOW_SAMPLE_NUMBERS) return;
    fetchSiteStats().then(setStats, () => {});
  }, []);
  return SHOW_SAMPLE_NUMBERS ? SAMPLE_NUMBERS : stats;
}

/** The four boxes: 2 across on phones, 4 across from md. */
export const ImpactNumbers: React.FC<{ className?: string }> = ({ className }) => {
  const numbers = useImpactNumbers();
  return (
    <ul className={cn('grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4', className)}>
      {IMPACT.map((item) => (
        <ImpactBox key={item.key} item={item} target={numbers ? numbers[item.key] : null} />
      ))}
    </ul>
  );
};
