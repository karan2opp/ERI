/**
 * Phone numbers are stored in international form ("+919876543210"). We don't verify them, so this only
 * checks that a number is plausible and tidies how it is typed.
 *
 * Accepted: a number with a country code ("+91 98765 43210", "+1 (415) 555-0132"), or a 10-digit
 * Indian mobile number, with or without a leading 0 ("98765 43210", "098765 43210"), which gets +91.
 * Returns null when it doesn't look like a phone number.
 */
export function normalizePhone(input: string): string | null {
  // Spaces, dashes, dots and brackets are just formatting
  const cleaned = input.trim().replace(/[\s\-().]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  const national = cleaned.replace(/^0/, '');
  if (/^[6-9]\d{9}$/.test(national)) return `+91${national}`;
  return null;
}
