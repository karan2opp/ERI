import type { Drive } from '../types';

/**
 * Adds (or replaces, or with null removes) a schema.org JSON-LD block in the page's <head>. Google reads these to show
 * things like upcoming events straight in its results.
 */
export function setJsonLd(id: string, data: unknown | null): void {
  document.getElementById(id)?.remove();
  if (data === null) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = id;
  // Nothing in the data can close the script tag
  script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
  document.head.appendChild(script);
}

// Drives are held in India: the times people enter are Indian Standard Time
const IST = '+05:30';

/**
 * The upcoming public drives as schema.org Events, which is what lets Google show a plantation drive or clean-up
 * drive as an event result. A drive without a place (an address or a map pin) is left out, since an Event needs one.
 */
export function drivesToEvents(drives: Drive[], siteUrl: string): unknown[] {
  const events: unknown[] = [];
  for (const d of drives) {
    const hasPin = typeof d.latitude === 'number' && typeof d.longitude === 'number';
    if (!d.address && !hasPin) continue;
    const time = /^\d{1,2}:\d{2}/.test(d.time) ? d.time.slice(0, 5).padStart(5, '0') : '00:00';
    const kind = d.type === 'CLEANUP' ? 'clean-up drive' : 'plantation drive';
    events.push({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: d.title,
      description: d.description?.trim() || `A ${kind} by Earth Revival Initiative. Everyone is welcome.`,
      startDate: `${d.date}T${time}:00${IST}`,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      isAccessibleForFree: true,
      location: {
        '@type': 'Place',
        name: d.address || d.title,
        ...(d.address ? { address: d.address } : {}),
        ...(hasPin ? { geo: { '@type': 'GeoCoordinates', latitude: d.latitude, longitude: d.longitude } } : {}),
      },
      image: [`${siteUrl}/og-home.jpg`],
      organizer: { '@type': 'NGO', name: 'Earth Revival Initiative', url: `${siteUrl}/` },
      url: `${siteUrl}/?drive=${d.id}`,
    });
  }
  return events;
}
