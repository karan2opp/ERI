import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, Recycle, Sprout, Trash2, Trees } from 'lucide-react';
import type { Drive } from '../types';
import { fetchDrivesPage, fetchSiteStats, type SiteStats } from '../services/api';
import { driveStartsAt } from '../lib/drives';
import { formatClock } from '../lib/time';
import { cn } from '../lib/cn';
import { Sapling } from '../components/ui/logo';
import { DONATE, DRIVES, MAP, SiteFooter, SiteHeader, siteButton, useSiteInfo } from '../components/site/SiteChrome';

const HERO_LEAD = 'A community tree-care network. Plant a tree, put it on the shared map, and keep it alive with help from your neighbours.';

const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cn('text-sm font-semibold tracking-wide text-leaf', className)}>{children}</p>
);

/** The four impact numbers (counted by the server) and the next few public drives. */
function useNumbers() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [upcoming, setUpcoming] = useState<Drive[] | null>(null);
  const [driveError, setDriveError] = useState(false);

  useEffect(() => {
    fetchSiteStats().then(setStats, () => {});
    // Signed out, so only drives marked for everyone: this is a public page
    fetchDrivesPage({ page: 1, limit: 3, when: 'upcoming' }).then(
      (r) => setUpcoming(r.data),
      () => setDriveError(true)
    );
  }, []);

  return { stats, upcoming, driveError };
}

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

/** One step of "How it works": a picture across the top, then the title and a few words. */
const Step: React.FC<{ image: string; title: string; children: React.ReactNode }> = ({ image, title, children }) => (
  <li className="flex flex-col overflow-hidden rounded-xl bg-muted">
    <img src={image} alt="" width={480} height={300} loading="lazy" className="aspect-[8/5] w-full bg-secondary object-cover" />
    <div className="flex flex-col gap-2 p-5">
      <h3 className="text-xl">{title}</h3>
      <p className="text-muted-foreground">{children}</p>
    </div>
  </li>
);

/** One upcoming drive: a date block, the title and when and where. Opens the drive's own page. */
const DriveRow: React.FC<{ drive: Drive }> = ({ drive }) => {
  const at = driveStartsAt(drive);
  const cleanup = drive.type === 'CLEANUP';
  return (
    <li>
      <a
        href={`/?drive=${drive.id}`}
        className="flex items-center gap-4 rounded-xl bg-card p-3 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span
          className={cn('flex size-16 shrink-0 flex-col items-center justify-center rounded-lg', cleanup ? 'bg-cleanup/12 text-cleanup' : 'bg-bark/12 text-bark')}
          aria-hidden="true"
        >
          <span className="font-heading text-2xl leading-none font-extrabold">{at ? at.getDate() : '–'}</span>
          <span className="mt-1 text-xs font-semibold uppercase">{at ? at.toLocaleDateString('en-IN', { month: 'short' }) : ''}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-medium">{drive.title}</span>
          <span className="block truncate text-muted-foreground">
            {cleanup ? 'Clean-up' : 'Plantation'} · {at ? at.toLocaleDateString('en-IN', { weekday: 'short' }) + ', ' : ''}{formatClock(drive.time)}
          </span>
          {drive.address && <span className="block truncate text-sm text-muted-foreground">{drive.address}</span>}
        </span>
        <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </a>
    </li>
  );
};

const InvolveCard: React.FC<{ href: string; title: string; label: string; external?: boolean; children: React.ReactNode }> = ({ href, title, label, external, children }) => (
  <li>
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group flex h-full flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-border transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <h3 className="text-xl">{title}</h3>
      <p className="flex-1 text-muted-foreground">{children}</p>
      <span className="inline-flex items-center gap-2 font-medium text-primary">
        {label}{' '}
        {external ? (
          <ExternalLink className="size-4" aria-hidden="true" />
        ) : (
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        )}
        {external && <span className="sr-only">(opens in a new tab)</span>}
      </span>
    </a>
  </li>
);

/**
 * The page at "/": who we are, how it works, the next drives and how to join in. Everything real comes
 * from the public API; the map itself lives at /map. Phone first: one column that grows into rows from md up.
 */
export const HomePage: React.FC = () => {
  const { stats, upcoming, driveError } = useNumbers();
  // The admin-set Google Form for joining the team; no button until it is set
  const joinTeamUrl = useSiteInfo()?.joinTeamFormUrl ?? '';
  const numbers = SHOW_SAMPLE_NUMBERS ? SAMPLE_NUMBERS : stats;
  const heroRef = useRef<HTMLElement>(null);

  // The in-page links glide down; undone when leaving so the map app is unaffected
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      {/* Floats over the picture, clear until the picture has scrolled past */}
      <SiteHeader overPhoto={heroRef} />

      <main>
        {/* Hero. Phones: a wide landscape picture with only the headline on it, the words and buttons just below.
            md and up: everything on the picture, which reaches up behind the header. A flat dark layer keeps white text readable. */}
        <section ref={heroRef} className="relative isolate overflow-hidden bg-[#0c1f0e] text-white">
          <img
            src="/home-1280.webp"
            srcSet="/home-640.webp 640w, /home-1280.webp 1280w, /home-1920.webp 1920w"
            sizes="100vw"
            alt=""
            fetchPriority="high"
            className="absolute inset-0 -z-10 size-full object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-[#0c1f0e]/55" aria-hidden="true" />

          <div className="mx-auto flex aspect-[3/2] min-h-[17rem] max-w-6xl flex-col justify-end px-4 pb-5 md:aspect-auto md:min-h-[720px] md:justify-center md:pt-28 md:pb-24">
            <p className="text-xs font-semibold tracking-wide text-[#d2e7c8] md:text-sm">Earth Revival Initiative</p>
            <h1 className="mt-1.5 max-w-3xl text-[1.9rem] leading-[1.08] font-extrabold text-white md:mt-3 md:text-7xl md:leading-[1.05]">Plant today, revive tomorrow.</h1>
            <div className="hidden md:block">
              <p className="mt-5 max-w-xl text-xl text-white/90">{HERO_LEAD}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={MAP} className={siteButton('primary', 'lg')}>
                  Open the tree map <ArrowRight className="size-5" aria-hidden="true" />
                </a>
                {joinTeamUrl && (
                  <a href={joinTeamUrl} target="_blank" rel="noopener noreferrer" className={siteButton('secondary', 'lg')}>
                    Join the team <ExternalLink className="size-5" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
                <a href={DRIVES} className={siteButton('secondary', 'lg')}>See upcoming drives</a>
              </div>
            </div>
          </div>
        </section>

        {/* Phones only: the words and the buttons, under the picture */}
        <div className="px-4 pt-5 md:hidden">
          <p className="text-base text-muted-foreground">{HERO_LEAD}</p>
          <div className="mt-4 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <a href={MAP} className={siteButton('primary', 'md')}>
              Open the tree map <ArrowRight aria-hidden="true" />
            </a>
            {joinTeamUrl && (
              <a href={joinTeamUrl} target="_blank" rel="noopener noreferrer" className={siteButton('secondary', 'md')}>
                Join the team <ExternalLink aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            <a href={DRIVES} className={cn(siteButton('secondary', 'md'), joinTeamUrl && 'min-[380px]:col-span-2')}>See upcoming drives</a>
          </div>
        </div>

        {/* Impact numbers, on the page just below the picture (they count up when it loads) */}
        <section aria-label="Our impact" className="mx-auto w-full max-w-6xl px-4 pt-10 md:pt-14">
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {IMPACT.map((item) => (
              <ImpactBox key={item.key} item={item} target={numbers ? numbers[item.key] : null} />
            ))}
          </ul>
        </section>

        <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-14 md:py-24">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-2 max-w-2xl text-3xl md:text-4xl">Planting is the easy part. Keeping a tree alive is what counts.</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            <Step image="/plant-it.webp" title="Plant it">
              Stand next to the tree and confirm your location with a photo. The map only holds real trees, planted where they say they are.
            </Step>
            <Step image="/find-it.webp" title="Find it">
              See every tree near you, which ones need water and who planted them. Get walking directions to any of them.
            </Step>
            <Step image="/care-it.webp" title="Care for it">
              Each tree has its own watering, feeding and weeding schedule. Log what you did so the next neighbour knows what it needs.
            </Step>
          </ol>
        </section>

        <section id="drives" className="scroll-mt-24 bg-muted">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1fr_1.2fr] md:items-start md:py-24">
            <div className="min-w-0">
              <Eyebrow>Drives</Eyebrow>
              <h2 className="mt-2 text-3xl md:text-4xl">Join a drive near you</h2>
              <p className="mt-4 text-muted-foreground">We gather volunteers on set days. You don't need any experience, just a willingness to get your hands dirty.</p>
              <ul className="mt-6 flex flex-col gap-4">
                <li className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-bark/12 text-bark" aria-hidden="true">
                    <Sprout className="size-5" />
                  </span>
                  <span>
                    <span className="block font-medium">Plantation drives</span>
                    <span className="text-muted-foreground">New trees go into the ground, and each one goes on the map.</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-cleanup/12 text-cleanup" aria-hidden="true">
                    <Trash2 className="size-5" />
                  </span>
                  <span>
                    <span className="block font-medium">Clean-up drives</span>
                    <span className="text-muted-foreground">We clear litter from streets and green spaces so trees have room to grow.</span>
                  </span>
                </li>
              </ul>
              <a href={DRIVES} className={cn(siteButton('primary', 'lg'), 'mt-8 w-full sm:w-auto')}>
                See all drives <ArrowRight aria-hidden="true" />
              </a>
            </div>

            <div className="min-w-0">
              <h3 className="mb-3 text-lg">Coming up</h3>
              {upcoming === null && !driveError ? (
                <p className="text-muted-foreground" role="status">Loading drives…</p>
              ) : driveError ? (
                <p className="text-muted-foreground">We couldn't load the drives just now. <a href={DRIVES} className="font-medium text-primary underline underline-offset-4">Open the drives page</a>.</p>
              ) : upcoming && upcoming.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {upcoming.map((d) => (
                    <DriveRow key={d.id} drive={d} />
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-10 text-center">
                  <Sapling />
                  <p className="max-w-xs text-muted-foreground">No drives are scheduled right now. When one is, it shows up here and on the map.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="join" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-14 md:py-24">
          <Eyebrow>Get involved</Eyebrow>
          <h2 className="mt-2 max-w-2xl text-3xl md:text-4xl">There's a way to help whatever your week looks like</h2>
          <ul className={cn('mt-8 grid gap-4 sm:grid-cols-2', joinTeamUrl ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
            <InvolveCard href={MAP} title="Plant a tree" label="Open the map">
              Planted one already, or want to? Add it to the map so the whole neighbourhood can look after it.
            </InvolveCard>
            <InvolveCard href={MAP} title="Care for a tree" label="Find trees near you">
              Trees that need water are marked on the map. A few minutes with a bucket can save one.
            </InvolveCard>
            <InvolveCard href={DRIVES} title="Come to a drive" label="See the drives">
              Meet other volunteers, plant together and clean up the places our trees grow in.
            </InvolveCard>
            {joinTeamUrl && (
              <InvolveCard href={joinTeamUrl} external title="Join the team" label="Fill in the form">
                Want to help run drives and look after trees with us? Tell us about yourself and we'll be in touch.
              </InvolveCard>
            )}
            <InvolveCard href={DONATE} title="Support with a donation" label="Donate">
              Saplings, tree guards, water and tools for drives all cost money. A gift of any size helps a tree survive.
            </InvolveCard>
          </ul>
        </section>

        <section className="bg-secondary text-secondary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 md:flex-row md:items-center md:justify-between md:py-20">
            <div>
              <h2 className="text-3xl md:text-4xl">Ready to plant?</h2>
              <p className="mt-2 max-w-xl text-muted-foreground">Open the map, find a tree that needs you, or add the one you just planted.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={MAP} className={siteButton('primary', 'lg')}>
                Open the tree map <ArrowRight aria-hidden="true" />
              </a>
              {joinTeamUrl && (
                <a href={joinTeamUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-card px-6 text-base font-medium text-primary ring-1 ring-primary/40 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-5">
                  Join the team <ExternalLink aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};
