/** Is this a link to Google Maps (full or short form)? Other sites are refused, so the field can't carry spam links. */
export const isGoogleMapsUrl = (value: string): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl') return true;
  if (host === 'goo.gl') return url.pathname.startsWith('/maps');
  // google.com, google.co.in, google.com.au and other country domains, but not lookalikes such as google.com.evil.io
  const googleDomain = String.raw`google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})`;
  if (new RegExp(String.raw`^maps\.${googleDomain}$`).test(host)) return true;
  return new RegExp(String.raw`^(?:www\.)?${googleDomain}$`).test(host) && url.pathname.startsWith('/maps');
};

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/**
 * The place a full Google Maps link points at, when the link says it: "!3d<lat>!4d<lng>" (the dropped pin),
 * "q=" / "query=" / "ll=" / "destination=" with "lat,lng", or "@lat,lng" (the view). Short links (maps.app.goo.gl)
 * carry no coordinates, so they give null.
 */
export const coordinatesFromGoogleMapsUrl = (value: string): { lat: number; lng: number } | null => {
  let text: string;
  try {
    text = decodeURIComponent(value);
  } catch {
    text = value;
  }
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const patterns = [
    new RegExp(String.raw`!3d${num}!4d${num}`),
    new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=${num}\s*,\s*${num}`),
    new RegExp(String.raw`/place/${num}\s*,\s*${num}`),
    new RegExp(String.raw`@${num},${num}`),
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (m && valid(Number(m[1]), Number(m[2]))) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
};
