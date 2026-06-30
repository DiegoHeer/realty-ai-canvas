/**
 * Shared domain types for Realty AI Canvas.
 * Kept framework-agnostic so they can be consumed by the app, the data layer,
 * and (later) a backend without pulling in React or React Native.
 */

import type { MultiPolygon, Polygon } from 'geojson';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface ListingImage {
  id: string;
  url: string;
  alt?: string;
}

export type ListingStatus = 'for_sale' | 'for_rent' | 'sold' | 'pending';

/** Physical building/dwelling type of a residence. */
export type BuildingType =
  | 'apartment'
  | 'terraced'
  | 'corner'
  | 'semi_detached'
  | 'detached';

/**
 * Foundation-risk indicators for a residence's postcode area, sourced from the
 * backend. The textual fields are Dutch domain data and are shown verbatim.
 */
export interface FoundationRisk {
  /** Risk label, e.g. "Kwetsbaar gebied - 60-80 %". */
  label?: string;
  /** Soil classification, e.g. "Zeekleigebied". */
  soilType?: string;
  /** Share of nearby buildings constructed before 1970, as a percentage. */
  pre1970Pct?: number;
}

export interface ListingAddress {
  line1: string;
  city: string;
  postalCode: string;
  country: string;
}

/** A realtor/source listing the residence can be viewed on. */
export interface ListingSource {
  /** URL of the original realtor/source listing. */
  url: string;
  /** Human-readable realtor name, e.g. "Funda". */
  name: string;
}

export interface Listing {
  id: string;
  title: string;
  description?: string;
  /** Price in the smallest sensible whole unit of `currency` (e.g. euros, not cents). */
  price: number;
  /** ISO 4217 currency code, e.g. "EUR". */
  currency: string;
  status: ListingStatus;
  bedrooms: number;
  bathrooms: number;
  /** Living area in square meters. */
  areaSqm: number;
  /** Total number of rooms, when reported by the source. */
  roomCount?: number;
  /** Construction year/period as reported by the source, e.g. "1973". */
  constructionPeriod?: string;
  /** Energy label, e.g. "C". */
  energyLabel?: string;
  /** Physical building type, when known. */
  buildingType?: BuildingType;
  /** Foundation-risk indicators for the postcode area, when known. */
  foundationRisk?: FoundationRisk;
  address: ListingAddress;
  location: GeoPoint;
  images: ListingImage[];
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** URL of the original realtor/source listing, if known. */
  sourceUrl?: string;
  /** Every realtor/source the residence is listed on, one entry per source. */
  sources?: ListingSource[];
}

/**
 * A colored area overlay drawn on the map (e.g. a neighborhood or search zone).
 * Rendered as a filled polygon at 50% opacity with a matching outline.
 */
export interface AreaPolygon {
  id: string;
  name?: string;
  /** Any CSS color string. Used for both the fill and the outline. */
  color: string;
  /** GeoJSON geometry in [longitude, latitude] order (WGS84). */
  geometry: Polygon | MultiPolygon;
}

/**
 * A municipality ("gemeente") boundary. Used to hit-test a tapped map point to
 * its city; the `code` is then reused to fetch that city's neighborhood shapes.
 */
export interface CityShape {
  /** CBS municipality code, e.g. "0518" for Den Haag. */
  code: string;
  name: string;
  /** GeoJSON geometry in [longitude, latitude] order (WGS84). */
  geometry: Polygon | MultiPolygon;
}

/**
 * CBS statistics for a single neighborhood. Matched to an {@link AreaPolygon}
 * by `code` === the polygon's `id`.
 */
export interface NeighborhoodStats {
  /** CBS neighborhood code; matches an AreaPolygon's `id`. */
  code: string;
  /** Year the figures describe, e.g. 2023. */
  statsYear: number;
  /** Raw CBS metrics keyed by field name. Values are counts, percentages, etc. */
  stats: Record<string, number>;
}

/** Transaction kind. Maps to the API's `deal_type`; buy→`sale`, rent→`rent`. */
export type DealType = 'sale' | 'rent';

/**
 * List/marker ordering. Mirrors the API's `sort` enum, minus `distance` (which
 * needs a reference point the app doesn't send yet).
 */
export type SortOption =
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'area_asc'
  | 'area_desc'
  | 'price_per_m2_asc';

/**
 * Filters accepted by the listings query — a flattened view of the search
 * filters, each field mapping to a `GET /v1/residences` query param. All
 * optional; an omitted field means "no constraint" on that facet.
 */
export interface ListingQuery {
  search?: string;
  /** Transaction kind; buy→`sale`, rent→`rent`. */
  dealType?: DealType;
  minPrice?: number;
  maxPrice?: number;
  /** Accepted building types, OR-combined. Empty/omitted = any. */
  buildingTypes?: BuildingType[];
  minBedrooms?: number;
  minBathrooms?: number;
  minAreaSqm?: number;
  maxAreaSqm?: number;
  /** Accepted energy labels, OR-combined. Empty/omitted = any. */
  energyLabels?: string[];
  /** Keep residences built in/after this year. */
  minBuildYear?: number;
  /** Sale-lifecycle sub-filter; not set by the map UI today. */
  status?: ListingStatus;
  /** Result ordering. Defaults to `newest` server-side when omitted. */
  sort?: SortOption;
}
