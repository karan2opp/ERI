/**
 * Phone numbers are kept in international form ("+919876543210"). They aren't verified, so these
 * helpers only tidy what people type; the server applies the same rules before saving.
 *
 * Accepted: a number with a country code ("+91 98765 43210"), or a 10-digit Indian mobile number,
 * with or without a leading 0 ("98765 43210"), which becomes +91.
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  const national = cleaned.replace(/^0/, '');
  if (/^[6-9]\d{9}$/.test(national)) return `+91${national}`;
  return null;
}

/** "+919876543210" -> "+91 98765 43210". Other countries are shown as stored. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const india = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return india ? `+91 ${india[1]} ${india[2]}` : phone;
}
