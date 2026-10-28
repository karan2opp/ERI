import { useEffect } from 'react';
import { ArrowRight, Droplets, Eye, HandHeart, Sprout, Trash2, Users } from 'lucide-react';
import { DONATE, MAP, SiteFooter, SiteHeader, siteButton, useSiteInfo } from '../components/site/SiteChrome';
import { ImpactNumbers } from '../components/site/ImpactNumbers';
import { PhotoSlider, type SliderPhoto } from '../components/site/PhotoSlider';

/** What the NGO does, each with a coloured icon (the same colours as on the map: brown planting, purple clean-up, blue water). */
const WORK: { icon: React.ReactNode; tone: string; title: string; text: string }[] = [
  {
    icon: <Sprout />,
    tone: 'bg-bark/12 text-bark',
    title: 'Plantation drives',
    text: 'We gather volunteers on set days to plant saplings in parks, along roads and in shared spaces. Every tree goes on our public map.',
  },
  {
    icon: <Trash2 />,
    tone: 'bg-cleanup/12 text-cleanup',
    title: 'Clean-up drives',
    text: 'We clear litter from streets and green spaces, so the places our trees grow in stay healthy for people and plants.',
  },
  {
    icon: <Droplets />,
    tone: 'bg-water/12 text-water',
    title: 'Care after planting',
    text: 'Through the tree map anyone can see which trees need water and log what they did, so no young tree is forgotten.',
  },
];

const BELIEFS: { icon: React.ReactNode; title: string; text: string }[] = [
  { icon: <Sprout />, title: 'A tree only counts if it survives', text: 'Planting is the easy part. We measure our work by the trees that make it through their first years.' },
  { icon: <Eye />, title: 'Everything in the open', text: 'Every tree is on a public map, and every drive gets a summary and pictures, so you can see what we do.' },
  { icon: <Users />, title: 'Everyone can help', text: 'No experience is needed. A bucket of water, an hour at a drive or a small donation all make a difference.' },
];

/** Photos from our drives for the slider; the web copies live in public/about (the originals are in public/Team). */
const DRIVE_PHOTOS: SliderPhoto[] = (
  [
    // name, what it shows, size of the -1200 copy
    ['team-after-a-plantation-drive', 'The team after a plantation drive', 1200, 901],
    ['volunteers-planting-a-sapling', 'Two volunteers planting a sapling', 780, 1040],
    ['volunteers-planting-across-the-park', 'Volunteers planting across the park', 1200, 675],
    ['volunteer-digging-with-a-spade', 'A volunteer digging the pit for a new tree', 900, 1200],
    ['saplings-on-the-way-by-scooter', 'Saplings on their way to a drive', 1200, 900],
    ['volunteers-planting-a-row-of-saplings', 'Volunteers planting a row of saplings', 900, 1200],
    ['team-with-guests-in-the-garden', 'The team with guests in the garden', 1200, 901],
    ['two-volunteers-with-a-new-sapling', 'Two volunteers with a newly planted sapling', 900, 1200],
    ['team-at-the-planting-site', 'The team at the planting site', 900, 1200],
    ['volunteer-with-a-freshly-planted-sapling', 'A volunteer beside a freshly planted sapling', 900, 1200],
  ] as const
).map(([name, caption, width, height]) => ({ small: `/about/${name}-640.webp`, large: `/about/${name}-1200.webp`, caption, width, height }));

/**
 * The About page (/about): who we are, what we do, our numbers so far, what we believe and how to join in.
 * It shares the header, footer and impact numbers with the home page.
 */
export const AboutPage: React.FC = () => {
  const joinTeamUrl = useSiteInfo()?.joinTeamFormUrl ?? '';

  // The page's title and description are in its HTML, written at build time from seo.config.ts (so search engines and link previews get them without running this code)

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:items-center md:py-16">
          <div>
            <p className="text-sm font-semibold tracking-wide text-leaf">About us</p>
            <h1 className="mt-2 text-[2rem] leading-tight md:text-5xl">Neighbours looking after the trees that look after us</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Earth Revival Initiative is an NGO that brings people together to plant trees, keep them alive and clean up the places they grow. We work from a simple
              idea: a tree only counts if it survives, so we stay with every sapling long after planting day.
            </p>
          </div>
          <img
            src="/about/team-group-photo-in-the-park-1600.webp"
            srcSet="/about/team-group-photo-in-the-park-800.webp 800w, /about/team-group-photo-in-the-park-1600.webp 1428w"
            sizes="(min-width: 768px) 45vw, 100vw"
            width={1428}
            height={803}
            fetchPriority="high"
            alt="The Earth Revival Initiative team together on the lawn of a park"
            className="aspect-video w-full rounded-xl object-cover"
          />
        </section>

        <section className="bg-muted" aria-labelledby="what-we-do">
          <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
            <h2 id="what-we-do" className="text-3xl md:text-4xl">What we do</h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {WORK.map((w) => (
                <li key={w.title} className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-border">
                  <span className={`grid size-10 place-items-center rounded-lg [&>svg]:size-5 ${w.tone}`} aria-hidden="true">
                    {w.icon}
                  </span>
                  <h3 className="font-sans text-lg font-semibold">{w.title}</h3>
                  <p className="text-muted-foreground">{w.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pt-12 md:pt-16" aria-labelledby="in-pictures">
          <h2 id="in-pictures" className="text-3xl md:text-4xl">Our drives in pictures</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Our volunteers at work: carrying saplings, digging, planting and looking after the young trees.</p>
          <PhotoSlider photos={DRIVE_PHOTOS} label="Photos from our drives" className="mt-6" />
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:py-16" aria-labelledby="so-far">
          <h2 id="so-far" className="text-3xl md:text-4xl">Our work so far</h2>
          <ImpactNumbers className="mt-6" />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-12 md:pb-16" aria-labelledby="believe">
          <h2 id="believe" className="text-3xl md:text-4xl">What we believe</h2>
          <ul className="mt-6 grid gap-6 md:grid-cols-3">
            {BELIEFS.map((b) => (
              <li key={b.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary [&>svg]:size-5" aria-hidden="true">
                  {b.icon}
                </span>
                <div>
                  <h3 className="font-sans text-lg font-semibold">{b.title}</h3>
                  <p className="mt-1 text-muted-foreground">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-secondary text-secondary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-12 md:flex-row md:items-center md:justify-between md:py-16">
            <div>
              <h2 className="text-3xl md:text-4xl">Join us</h2>
              <p className="mt-2 max-w-xl text-muted-foreground">Find a tree that needs water, come to a drive, join the team or support us with a donation.</p>
            </div>
            <div className="flex flex-wrap gap-3 md:shrink-0 md:flex-nowrap">
              <a href={MAP} className={siteButton('primary', 'lg')}>
                Open the tree map <ArrowRight aria-hidden="true" />
              </a>
              {joinTeamUrl && (
                <a href={joinTeamUrl} target="_blank" rel="noopener noreferrer" className={siteButton('light', 'lg')}>
                  <Users aria-hidden="true" /> Join the team
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
              <a href={DONATE} className={siteButton('light', 'lg')}>
                <HandHeart aria-hidden="true" /> Donate
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};
