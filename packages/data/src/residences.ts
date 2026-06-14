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
  /** Living area in square meters. */
  surface_area_m2?: number | null;
  bedroom_count?: number | null;
  bathroom_count?: number | null;
  room_count?: number | null;
  /** Construction year/period as reported by the source, e.g. "1973". */
  construction_period?: string | null;
  /** Energy label, e.g. "C". */
  energy_label?: string | null;
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
  // The per-residence attributes (area, beds, …) live on the source listings.
  // A residence can carry several; prefer the first that reports a living area.
  const detail = r.listings.find((l) => l.surface_area_m2 != null) ?? r.listings[0];
  return {
    id: String(r.id),
    title: line1,
    price: r.current_price_eur ?? 0,
    currency: 'EUR',
    status: STATUS_TO_LISTING[r.current_status] ?? 'for_sale',
    bedrooms: detail?.bedroom_count ?? 0,
    bathrooms: detail?.bathroom_count ?? 0,
    areaSqm: detail?.surface_area_m2 ?? 0,
    roomCount: detail?.room_count ?? undefined,
    constructionPeriod: detail?.construction_period ?? undefined,
    energyLabel: detail?.energy_label ?? undefined,
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
