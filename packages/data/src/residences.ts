import type { Listing, ListingStatus } from '@realty/types';

/**
 * Adapter for the Realty Alerts API (`GET /v1/residences`).
 *
 * The backend models a deduplicated *residence* (a physical address, keyed by
 * its BAG id) with the listings that reference it. Our app speaks `Listing`, so
 * we map one residence → one `Listing` for display on the map and lists.
 *
 * Spec: https://api-staging.realty-ai.nl/docs
 */

/** `current_status` values returned by the API. */
export type ResidenceStatus = 'new' | 'sale_pending' | 'sold';

/** A single source listing attached to a residence (the `ListingOut` schema). */
export interface ResidenceSource {
  url: string;
  website: 'funda' | 'pararius' | 'vastgoed_nl';
  first_seen_at: string;
  /** Present in responses though absent from the OpenAPI schema. */
  image_url?: string | null;
}

/** A residence as returned by `GET /v1/residences` (the `ResidenceOut` schema). */
export interface ResidenceOut {
  id: number;
  bag_id: string;
  city: string;
  street: string | null;
  house_number: number | null;
  house_letter: string | null;
  house_number_suffix: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  neighbourhood: string | null;
  district: string | null;
  current_price_eur: number | null;
  current_status: ResidenceStatus;
  last_scraped_at: string | null;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
  listings: ResidenceSource[];
}

/** Map the API's residence status onto our app-facing listing status. */
const STATUS_TO_LISTING: Record<ResidenceStatus, ListingStatus> = {
  new: 'for_sale',
  sale_pending: 'pending',
  sold: 'sold',
};

/** Reverse map, for translating a UI status filter into the `status` query param. */
export const LISTING_TO_RESIDENCE_STATUS: Partial<Record<ListingStatus, ResidenceStatus>> = {
  for_sale: 'new',
  pending: 'sale_pending',
  sold: 'sold',
};

/** "Kardoenhof 53", "Burgemeester Rothestraat 18N", … — empty parts dropped. */
function addressLine(r: ResidenceOut): string {
  const number = [r.house_number, r.house_letter, r.house_number_suffix]
    .filter((p) => p != null && p !== '')
    .join('');
  return [r.street, number].filter(Boolean).join(' ').trim();
}

/** A residence can only appear on the map if it has been geocoded. */
export function hasCoordinates(
  r: ResidenceOut,
): r is ResidenceOut & { latitude: number; longitude: number } {
  return r.latitude != null && r.longitude != null;
}

/** Convert a geocoded residence into the app's `Listing` shape. */
export function residenceToListing(
  r: ResidenceOut & { latitude: number; longitude: number },
): Listing {
  const line1 = addressLine(r) || r.city;
  const images = r.listings
    .filter((l) => l.image_url)
    .map((l, i) => ({ id: `${r.id}-${i}`, url: l.image_url as string, alt: line1 }));
  return {
    id: String(r.id),
    title: line1,
    // The list endpoint doesn't carry bed/bath/area; those arrive via the
    // detail scrape, which isn't exposed publicly yet. Map markers only need
    // location + price, so 0 is a safe placeholder here.
    price: r.current_price_eur ?? 0,
    currency: 'EUR',
    status: STATUS_TO_LISTING[r.current_status] ?? 'for_sale',
    bedrooms: 0,
    bathrooms: 0,
    areaSqm: 0,
    address: {
      line1,
      city: r.city,
      postalCode: r.postcode ?? '',
      country: 'NL',
    },
    location: { latitude: r.latitude, longitude: r.longitude },
    images,
    createdAt: r.created_at,
    // First source listing is the realtor page we link out to.
    sourceUrl: r.listings[0]?.url,
  };
}
