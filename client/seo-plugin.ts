import type { Plugin } from 'vite';
import { NAV_LINKS, ORGANIZATION, PAGES, SHARE_IMAGE, SITE_NAME, SITE_URL, WEBSITE, type SeoPage } from './seo.config.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// JSON inside a <script> must not be able to close it
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

const urlOf = (page: SeoPage) => (page.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${page.path}`);

/** Everything search engines and link previews read from a page's <head>. */
function headTags(page: SeoPage): string {
  const url = urlOf(page);
  const image = `${SITE_URL}${SHARE_IMAGE}`;
  const lines = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Volunteers of Earth Revival Initiative planting a tree" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ];
  // Who we are is told once, on the home page
  if (page.path === '/') {
    lines.push(`<script type="application/ld+json">${json(ORGANIZATION)}</script>`, `<script type="application/ld+json">${json(WEBSITE)}</script>`);
  }
  return lines.join('\n    ');
}

/** Real text and links for crawlers and people that don't run JavaScript (the app replaces all of this once it loads). */
function noscriptBody(page: SeoPage): string {
  const links = NAV_LINKS.map((l) => `<li><a href="${l.path}">${esc(l.label)}</a></li>`).join('');
  return `<noscript><main><h1>${esc(page.heading)}</h1><p>${esc(page.summary)}</p><nav aria-label="Site"><ul>${links}</ul></nav></main></noscript>`;
}

const HEAD_START = '<!--seo-head-->';
const HEAD_END = '<!--/seo-head-->';
const BODY_START = '<!--seo-body-->';
const BODY_END = '<!--/seo-body-->';

const between = (html: string, start: string, end: string, replacement: string) => {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a === -1 || b === -1 || b < a) throw new Error(`seo-plugin: the ${start} markers are missing from the built index.html`);
  return html.slice(0, a + start.length) + '\n    ' + replacement + '\n    ' + html.slice(b);
};

const forPage = (html: string, page: SeoPage) => {
  let out = between(html, HEAD_START, HEAD_END, headTags(page));
  out = between(out, BODY_START, BODY_END, noscriptBody(page));
  return out;
};

/**
 * Search engine optimisation, done when the site is built:
 *  - index.html (the home page, and what the map app is served from) gets the home page's title, description,
 *    canonical address, link-preview tags and schema.org markup;
 *  - about/index.html, media/index.html and donate/index.html are copies with their own, so each page has the right
 *    title and description for Google and for WhatsApp / Facebook previews, which do not run JavaScript;
 *  - robots.txt and sitemap.xml.
 * The hosting serves a real file before it applies the "send everything to index.html" rewrite, so /about gets about/index.html.
 */
export function seoPlugin(): Plugin {
  return {
    name: 'seo-pages',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => forPage(html, PAGES[0]),
    },
    // After Vite has written index.html into the bundle
    generateBundle: { order: 'post', handler(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') throw new Error('seo-plugin: index.html was not built');
      const home = String(index.source);

      for (const page of PAGES.filter((p) => p.path !== '/')) {
        this.emitFile({ type: 'asset', fileName: `${page.path.slice(1)}/index.html`, source: forPage(home, page) });
      }

      const today = new Date().toISOString().slice(0, 10);
      const urls = PAGES.map(
        (p) => `  <url>\n    <loc>${urlOf(p)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${p.priority.toFixed(1)}</priority>\n  </url>`
      ).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n` });
    } },
  };
}
