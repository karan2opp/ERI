import type { PlaceForm, PlaceFormKind } from '../services/api';

/** What a form asks for, in words. */
export const FORM_KIND_LABEL: Record<PlaceFormKind, string> = {
  PLANTATION: 'Places to plant trees',
  CLEANUP: 'Places to clean up',
  EITHER: 'Places to plant or clean up',
};

/** Badge colours: brown for planting, purple for clean-up, as on the map. */
export const FORM_KIND_BADGE: Record<PlaceFormKind, 'drive' | 'cleanup' | 'secondary'> = {
  PLANTATION: 'drive',
  CLEANUP: 'cleanup',
  EITHER: 'secondary',
};

export const isOpen = (form: Pick<PlaceForm, 'status'>) => form.status === 'OPEN';

/** A link that opens this form in the app, to share. */
export const placeFormLink = (formId: string) => `${window.location.origin}/map?open=places&form=${formId}`;

/** Google Maps at a point, for admins who want directions. */
export const googleMapsAt = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
