import type { Listing } from '@realty/types';

/** Fallback map centre (Amsterdam) when there are no polygons or listings to frame. */
export const DEFAULT_CENTER = { longitude: 4.9041, latitude: 52.3676 } as const;

/** Compact price shown inside a map marker, e.g. "€450k" (≥ €1k) or the raw price below it. */
export function priceLabel(listing: Listing): string {
  const k = Math.round(listing.price / 1000);
  return k >= 1 ? `${listing.currency === 'EUR' ? '€' : ''}${k}k` : `${listing.price}`;
}
