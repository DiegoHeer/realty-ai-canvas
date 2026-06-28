import type { Listing } from '@realty/types';

/** Fallback map centre (Amsterdam) when there are no polygons or listings to frame. */
export const DEFAULT_CENTER = { longitude: 4.9041, latitude: 52.3676 } as const;

/**
 * Compact price shown inside a map marker:
 * - ≥ €1M  → millions with up to 2 decimals, e.g. 1,252,000 → "€1.25M"
 * - ≥ €1k  → thousands, e.g. 450,000 → "€450k"
 * - below  → the raw price.
 */
export function priceLabel(listing: Listing): string {
  const prefix = listing.currency === 'EUR' ? '€' : '';
  const k = Math.round(listing.price / 1000);
  // Once the rounded thousands reach 1000 ("1000k"), show millions instead.
  // Dividing by 10k then by 100 rounds to 2 decimals; Number drops any trailing
  // zeros, so 1,500,000 → "1.5M" and 1,000,000 → "1M".
  if (k >= 1000) {
    const millions = Math.round(listing.price / 10_000) / 100;
    return `${prefix}${millions}M`;
  }
  return k >= 1 ? `${prefix}${k}k` : `${listing.price}`;
}
