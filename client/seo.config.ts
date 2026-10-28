// What search engines and link previews see for each public page. Used at build time by seo-plugin.ts, which writes
// these into the page's HTML (so they are there without running any JavaScript), plus robots.txt and sitemap.xml.
//
// The page titles and descriptions are written for what people type into Google: the name of the NGO, "plantation
// drive" and "clean-up drive". Keep titles under about 60 characters and descriptions under about 155, or Google cuts them.

/** The public address of the site (the one people share). Set VITE_SITE_URL when building for another address. */
export const SITE_URL = (process.env.VITE_SITE_URL || 'https://www.earthrevivalinitiative.in').replace(/\/+$/, '');

export const SITE_NAME = 'Earth Revival Initiative';

/** A 1200 x 630 jpg in client/public: link previews need a jpg or png. */
export const SHARE_IMAGE = '/og-home.jpg';

export interface SeoPage {
  /** The address, "/" for the home page */
  path: string;
  title: string;
  description: string;
  /** Plain text for people and crawlers that don't run JavaScript (shown only then) */
  heading: string;
  summary: string;
  priority: number;
}

export const PAGES: SeoPage[] = [
  {
    path: '/',
    title: 'Earth Revival Initiative | Plantation & Clean-up Drives',
    description:
      'Earth Revival Initiative is an NGO that holds tree plantation drives and clean-up drives, and keeps a shared map of every tree we plant. Join a drive and help a tree survive.',
    heading: 'Earth Revival Initiative: plantation drives and clean-up drives',
    summary: 'Plant today, revive tomorrow. We hold tree plantation drives and clean-up drives, and keep a shared map of every tree we plant so neighbours can look after it.',
    priority: 1,
  },
  {
    path: '/about',
    title: 'About Earth Revival Initiative | Plantation Drives & Clean-ups',
    description:
      'Who we are, what we do and how you can help: Earth Revival Initiative runs tree plantation drives and clean-up drives, and cares for the trees after they are planted.',
    heading: 'About Earth Revival Initiative',
    summary: 'Earth Revival Initiative is an NGO that plants trees, holds clean-up drives and looks after the trees it plants. Anyone can join a plantation drive or a clean-up drive.',
    priority: 0.8,
  },
  {
    path: '/media',
    title: 'Photos & Videos of Our Drives | Earth Revival Initiative',
    description: 'Photos and videos of the Earth Revival Initiative team at work: tree plantation drives, clean-up drives and the days we spend caring for trees.',
    heading: 'Our team at work',
    summary: 'Photos and videos from the plantation drives, clean-up drives and tree care days of Earth Revival Initiative.',
    priority: 0.6,
  },
  {
    path: '/donate',
    title: 'Donate to Earth Revival Initiative | Plant & Care for Trees',
    description: 'Your donation to Earth Revival Initiative pays for saplings, tree guards, water and the tools for our plantation and clean-up drives.',
    heading: 'Donate to Earth Revival Initiative',
    summary: 'Donations pay for saplings and tree guards, water and care, tools for drives, and the tree map.',
    priority: 0.6,
  },
];

/** Links shown to crawlers that don't run JavaScript. */
export const NAV_LINKS: { path: string; label: string }[] = [
  { path: '/', label: 'Home' },
  { path: '/about', label: 'About us' },
  { path: '/media', label: 'Photos and videos' },
  { path: '/donate', label: 'Donate' },
  { path: '/map', label: 'Tree map' },
];

/** Who we are, for Google's knowledge panel and results (schema.org markup on the home page). */
export const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'NGO',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: ['Earth Revival Initiative NGO', 'ERI'],
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/icon-512.png`,
  image: `${SITE_URL}${SHARE_IMAGE}`,
  slogan: 'Plant today, revive tomorrow',
  description:
    'Earth Revival Initiative holds tree plantation drives and clean-up drives, and keeps a shared map of the trees it plants so they get the care they need.',
  knowsAbout: ['tree plantation drives', 'clean-up drives', 'tree care', 'environment'],
};

export const WEBSITE = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  url: `${SITE_URL}/`,
  name: SITE_NAME,
  inLanguage: 'en-IN',
  publisher: { '@id': `${SITE_URL}/#organization` },
};
