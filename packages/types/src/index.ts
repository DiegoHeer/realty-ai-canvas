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

export interface ListingAddress {
  line1: string;
  city: string;
  postalCode: string;
  country: string;
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
  address: ListingAddress;
  location: GeoPoint;
  images: ListingImage[];
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** URL of the original realtor/source listing, if known. */
  sourceUrl?: string;
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

/** Filters accepted by the listings query. All fields optional. */
export interface ListingQuery {
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: ListingStatus;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
