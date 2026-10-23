import { useEffect } from 'react';
import { Camera, Droplets, MapPin, MessageCircle, Shovel, Sprout } from 'lucide-react';
import { DRIVES, SiteFooter, SiteHeader, siteButton, useSiteInfo } from '../components/site/SiteChrome';
import { cn } from '../lib/cn';

const WHATSAPP_MESSAGE = "Hi Earth Revival Initiative! I'd like to make a donation.";

/** Where a donation goes, in plain words. */
const USES: { icon: React.ReactNode; title: string; text: string }[] = [
  {
    icon: <Sprout />,
    title: 'Saplings and tree guards',
    text: 'Healthy native saplings, and guards that keep cattle and feet off them while they are small.',
  },
  {
    icon: <Droplets />,
    title: 'Water and care',
    text: 'Water, compost and weeding through the first months, when most young trees are lost.',
  },
  {
    icon: <Shovel />,
    title: 'Tools for drives',
    text: 'Spades, gloves, bags and the other things volunteers need at plantation and clean-up drives.',
  },
  {
    icon: <MapPin />,
    title: 'The tree map',
    text: 'Running this website and map, so everyone can find the trees that need water and look after them.',
  },
];

/**
 * The Donate page (/donate): why we ask, what donations pay for, and a button that opens a WhatsApp chat with
 * the team (the number is set by an admin in Admin > Socials). Until a number is set, the button says donations open soon.
 */
export const DonatePage: React.FC = () => {
  const info = useSiteInfo();
  const digits = info?.donateWhatsapp.replace(/\D/g, '') ?? '';
  const whatsapp = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}` : null;

  useEffect(() => {
    const previous = document.title;
    document.title = 'Donate · Earth Revival Initiative';
    return () => {
      document.title = previous;
    };
  }, []);

  const donateButton = (className?: string) =>
    whatsapp ? (
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={siteButton('primary', 'lg', className)}>
        <MessageCircle aria-hidden="true" /> Donate on WhatsApp
        <span className="sr-only">(opens WhatsApp)</span>
      </a>
    ) : (
      <span className={cn(siteButton('primary', 'lg', className), 'cursor-not-allowed opacity-60')} aria-disabled="true">
        <MessageCircle aria-hidden="true" /> Donate on WhatsApp
      </span>
    );

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:items-center md:py-16">
          <div>
            <p className="text-sm font-semibold tracking-wide text-leaf">Donate</p>
            <h1 className="mt-2 text-[2rem] leading-tight md:text-5xl">Help a tree make it through its first year</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Planting a sapling is the easy part. Keeping it alive takes water, protection and people who come back to care for it. Your donation pays for
              exactly that, and helps us run plantation and clean-up drives across the neighbourhood.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {donateButton('w-full sm:w-auto sm:self-start')}
              <p className="text-sm text-muted-foreground">
                {whatsapp
                  ? 'Opens a WhatsApp chat with our team. Tell us how much you would like to give and we will reply with how to pay.'
                  : 'Donations on WhatsApp will open soon. Please check back in a little while.'}
              </p>
            </div>
          </div>
          <img src="/plant-it.webp" alt="Hands pressing soil around a newly planted sapling" className="aspect-[3/2] w-full rounded-xl object-cover" />
        </section>

        <section className="bg-muted" aria-labelledby="where-it-goes">
          <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
            <h2 id="where-it-goes" className="text-3xl md:text-4xl">Where your donation goes</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {USES.map((u) => (
                <li key={u.title} className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-border">
                  <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary [&>svg]:size-5" aria-hidden="true">
                    {u.icon}
                  </span>
                  <h3 className="font-sans text-base font-semibold">{u.title}</h3>
                  <p className="text-sm text-muted-foreground">{u.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:py-16" aria-labelledby="how-to-give">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 id="how-to-give" className="text-3xl md:text-4xl">How to give</h2>
              <ol className="mt-5 flex flex-col gap-4">
                {[
                  'Tap Donate on WhatsApp. A chat with our team opens with a message ready to send.',
                  'Tell us how much you would like to give. We reply with how to pay.',
                  'That is it. Your gift goes into saplings, water and the next drives.',
                ].map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">{i + 1}</span>
                    <span className="pt-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-3 rounded-xl bg-secondary p-6">
              <span className="grid size-10 place-items-center rounded-lg bg-card text-primary [&>svg]:size-5" aria-hidden="true">
                <Camera />
              </span>
              <h3 className="text-xl">See what it does</h3>
              <p className="text-muted-foreground">
                After every drive we post a summary and pictures, and every tree we plant goes on the public map, so you can see where the money went.
              </p>
              <a href={DRIVES} className="font-medium text-primary underline underline-offset-4">See our drives</a>
            </div>
          </div>
          <div className="mt-10 flex justify-center">{donateButton('w-full sm:w-auto')}</div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};
