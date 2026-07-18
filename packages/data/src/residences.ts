import type { BuildingType, FoundationRisk, Listing, ListingStatus } from '@realty/types';

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
  first_seen_at?: string;
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

/**
 * A list item as returned by `GET /v1/residences` (the `ResidenceSummaryOut`
 * schema): a slim, flattened projection of a residence — the per-source
 * attributes (area, beds, image) are pre-merged server-side and there is no
 * `listings` array. The full {@link ResidenceOut} now only comes from the
 * detail endpoint, `GET /v1/residences/{id}`.
 */
export interface ResidenceSummaryOut {
  id: number;
  city: string;
  street: string | null;
  house_number: number | null;
  house_letter: string | null;
  house_number_suffix: string | null;
  postcode: string | null;
  /** SEO-friendly address slug, e.g. "martin-luther-kinglaan-129". `null` when the residence has no street. */
  slug: string | null;
  /** Required by the schema, but kept nullable defensively (see hasCoordinates). */
  latitude: number | null;
  longitude: number | null;
  current_price_eur: number | null;
  current_status: ResidenceStatus;
  /** Living area in square meters. */
  surface_area_m2?: number | null;
  bedroom_count?: number | null;
  bathroom_count?: number | null;
  /** Energy label, e.g. "C". */
  energy_label?: string | null;
  image_url?: string | null;
}

/** A residence as returned by `GET /v1/residences/{id}` (the `ResidenceOut` schema). */
export interface ResidenceOut {
  id: number;
  bag_id: string;
  city: string;
  street: string | null;
  house_number: number | null;
  house_letter: string | null;
  house_number_suffix: string | null;
  postcode: string | null;
  /** SEO-friendly address slug, e.g. "martin-luther-kinglaan-129". `null` when the residence has no street. */
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  neighbourhood: string | null;
  district: string | null;
  /** Physical building type. Absent/`null` when the backend hasn't classified it. */
  building_type?: BuildingType | null;
  /** Foundation-risk label for the postcode area, e.g. "Kwetsbaar gebied - 60-80 %". */
  foundation_risk_label?: string | null;
  /** Dominant soil classification, e.g. "Zeekleigebied". */
  foundation_risk_soil_type?: string | null;
  /** Share of nearby buildings built before 1970, as a percentage. */
  foundation_risk_pre1970_pct?: number | null;
  /** Long Dutch prose explaining the risk. Not surfaced in the app. */
  foundation_risk_description?: string | null;
  /** Flattened per-residence attributes, merged server-side from the sources. */
  surface_area_m2?: number | null;
  bedroom_count?: number | null;
  bathroom_count?: number | null;
  /** Construction year from the BAG registry, e.g. 1964. */
  build_year?: number | null;
  /** Energy label, e.g. "C". */
  energy_label?: string | null;
  current_price_eur: number | null;
  current_status: ResidenceStatus;
  last_scraped_at: string | null;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
  /** The source listings backing this residence. Defensive-optional. */
  listings?: ResidenceSource[];
}

/** Human-readable realtor names for the source `website` values. */
const WEBSITE_NAMES: Record<ResidenceSource['website'], string> = {
  funda: 'Funda',
  pararius: 'Pararius',
  vastgoed_nl: 'Vastgoed NL',
};

/**
 * Paginated envelope returned by `GET /v1/residences` (the `ResidencePage`
 * schema). Older backends returned a bare array instead; the client tolerates
 * both shapes — see `getListings`.
 */
export interface ResidencePage {
  items: ResidenceSummaryOut[];
  /** Total residences matching the filters, ignoring `limit`/`offset`. */
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
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
function addressLine(r: ResidenceSummaryOut | ResidenceOut): string {
  const number = [r.house_number, r.house_letter, r.house_number_suffix]
    .filter((p) => p != null && p !== '')
    .join('');
  return [r.street, number].filter(Boolean).join(' ').trim();
}

/** Collect the foundation-risk fields into one object, or `undefined` if none are set. */
function foundationRiskOf(r: ResidenceOut): FoundationRisk | undefined {
  const label = r.foundation_risk_label ?? undefined;
  const soilType = r.foundation_risk_soil_type ?? undefined;
  const pre1970Pct = r.foundation_risk_pre1970_pct ?? undefined;
  if (label == null && soilType == null && pre1970Pct == null) return undefined;
  return { label, soilType, pre1970Pct };
}

/** A residence can only appear on the map if it has been geocoded. */
export function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  r: T,
): r is T & { latitude: number; longitude: number } {
  return r.latitude != null && r.longitude != null;
}

/**
 * Convert a geocoded list item into the app's `Listing` shape. Fields the
 * summary doesn't carry (sources, foundation risk, createdAt, …) stay empty;
 * the detail screen re-fetches the full residence, which fills them in.
 */
export function summaryToListing(
  r: ResidenceSummaryOut & { latitude: number; longitude: number },
): Listing {
  const line1 = addressLine(r) || r.city;
  return {
    id: String(r.id),
    title: line1,
    price: r.current_price_eur ?? 0,
    currency: 'EUR',
    status: STATUS_TO_LISTING[r.current_status] ?? 'for_sale',
    bedrooms: r.bedroom_count ?? 0,
    bathrooms: r.bathroom_count ?? 0,
    areaSqm: r.surface_area_m2 ?? 0,
    energyLabel: r.energy_label ?? undefined,
    address: {
      line1,
      city: r.city,
      postalCode: r.postcode ?? '',
      country: 'NL',
    },
    location: { latitude: r.latitude, longitude: r.longitude },
    images: r.image_url ? [{ id: `${r.id}-0`, url: r.image_url, alt: line1 }] : [],
    // The summary has no created_at; '' parses to NaN, which the relative-time
    // formatter treats as "unknown" (renders nothing).
    createdAt: '',
    slug: r.slug ?? undefined,
  };
}

/** Convert a geocoded residence into the app's `Listing` shape. */
export function residenceToListing(
  r: ResidenceOut & { latitude: number; longitude: number },
): Listing {
  const line1 = addressLine(r) || r.city;
  const sources = r.listings ?? [];
  const images = sources
    .filter((l) => l.image_url)
    .map((l, i) => ({ id: `${r.id}-${i}`, url: l.image_url as string, alt: line1 }));
  // Prefer the flattened per-residence attributes (merged server-side); fall
  // back to the source listings — a residence can carry several, so pick the
  // first that reports a living area.
  const detail = sources.find((l) => l.surface_area_m2 != null) ?? sources[0];
  return {
    id: String(r.id),
    title: line1,
    price: r.current_price_eur ?? 0,
    currency: 'EUR',
    status: STATUS_TO_LISTING[r.current_status] ?? 'for_sale',
    bedrooms: r.bedroom_count ?? detail?.bedroom_count ?? 0,
    bathrooms: r.bathroom_count ?? detail?.bathroom_count ?? 0,
    areaSqm: r.surface_area_m2 ?? detail?.surface_area_m2 ?? 0,
    roomCount: detail?.room_count ?? undefined,
    constructionPeriod:
      detail?.construction_period ?? (r.build_year != null ? String(r.build_year) : undefined),
    energyLabel: r.energy_label ?? detail?.energy_label ?? undefined,
    buildingType: r.building_type ?? undefined,
    foundationRisk: foundationRiskOf(r),
    address: {
      line1,
      city: r.city,
      postalCode: r.postcode ?? '',
      country: 'NL',
    },
    location: { latitude: r.latitude, longitude: r.longitude },
    images,
    createdAt: r.created_at,
    slug: r.slug ?? undefined,
    // First source listing is the realtor page we link out to.
    sourceUrl: sources[0]?.url,
    // One entry per source listing, so the UI can link out to each realtor.
    sources: sources
      .filter((l) => l.url)
      .map((l) => ({ url: l.url, name: WEBSITE_NAMES[l.website] ?? l.website })),
  };
}
