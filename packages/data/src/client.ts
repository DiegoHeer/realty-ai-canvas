import type { AreaPolygon, CityShape, Listing, ListingQuery, NeighborhoodStats } from '@realty/types';

import { API_BASE, API_URL, API_VERSION, USE_LISTING_MOCKS } from './env';
import { mockCityNames, mockListings } from './mocks';
import {
  hasCoordinates,
  LISTING_TO_RESIDENCE_STATUS,
  residenceToListing,
  type ResidenceOut,
  type ResidencePage,
} from './residences';

/** Max residences the API returns per request (the `limit` ceiling). */
const RESIDENCE_PAGE_SIZE = 100;

/**
 * Auth hook for `request()`. The app (which owns token storage) registers a
 * config at boot via `configureAuthInterceptor`; the data package stays free of
 * native storage deps. `getAccessToken` is read synchronously per request;
 * `refresh` is awaited once on a 401 (see Task 5).
 */
export interface AuthInterceptorConfig {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
}

let authInterceptor: AuthInterceptorConfig | null = null;

export function configureAuthInterceptor(config: AuthInterceptorConfig | null): void {
  authInterceptor = config;
}

let refreshInFlight: Promise<string | null> | null = null;

/** Coalesce concurrent refreshes into one network call. */
function refreshOnce(): Promise<string | null> {
  if (!authInterceptor) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = authInterceptor.refresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Trigger (or join) the single-flight token refresh used by the 401 retry path.
 * Exposed so other refreshers — e.g. boot hydration — coalesce through the same
 * in-flight promise instead of issuing a competing `refresh()` that would race
 * to consume the (rotating) refresh token and spuriously sign the user out.
 */
export function coalescedRefresh(): Promise<string | null> {
  return refreshOnce();
}

/**
 * Thin typed wrapper around `fetch`. Swap `USE_MOCKS` off (by setting
 * `EXPO_PUBLIC_API_URL`) and these functions hit the real backend instead.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const send = (token: string | null) => {
    const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...authHeader, ...init?.headers },
    });
  };

  let res = await send(authInterceptor?.getAccessToken() ?? null);

  if (res.status === 401 && authInterceptor) {
    const newToken = await refreshOnce();
    if (!newToken) {
      throw new Error(`Request to ${path} failed: 401 (refresh failed)`);
    }
    res = await send(newToken);
  }

  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Parse a 4-digit year from a free-form construction period ("1973"). */
function parseYear(period: string | undefined): number | null {
  if (!period) return null;
  const match = period.match(/\d{4}/);
  return match ? Number.parseInt(match[0], 10) : null;
}

/**
 * Mock-mode filter predicate. Mirrors the server-side filtering the real
 * `/v1/residences` performs (see {@link buildResidenceParams}), so the bundled
 * and web-export builds behave like the live API. `null`/empty/`0` facets are
 * treated as "no constraint".
 */
function matchesQuery(listing: Listing, query: ListingQuery): boolean {
  if (query.dealType === 'sale' && listing.status === 'for_rent') return false;
  if (query.dealType === 'rent' && listing.status !== 'for_rent') return false;
  if (query.status && listing.status !== query.status) return false;
  if (query.minPrice != null && listing.price < query.minPrice) return false;
  if (query.maxPrice != null && listing.price > query.maxPrice) return false;
  if (
    query.buildingTypes?.length &&
    (!listing.buildingType || !query.buildingTypes.includes(listing.buildingType))
  )
    return false;
  if (query.minBedrooms != null && listing.bedrooms < query.minBedrooms) return false;
  if (query.minBathrooms != null && listing.bathrooms < query.minBathrooms) return false;
  if (query.minAreaSqm != null && listing.areaSqm < query.minAreaSqm) return false;
  if (query.maxAreaSqm != null && listing.areaSqm > query.maxAreaSqm) return false;
  if (
    query.energyLabels?.length &&
    (!listing.energyLabel || !query.energyLabels.includes(listing.energyLabel))
  )
    return false;
  if (query.minBuildYear != null) {
    const year = parseYear(listing.constructionPeriod);
    if (year === null || year < query.minBuildYear) return false;
  }
  if (query.search) {
    const haystack = `${listing.title} ${listing.address.line1} ${listing.address.city}`.toLowerCase();
    if (!haystack.includes(query.search.toLowerCase())) return false;
  }
  return true;
}

/**
 * Translate a {@link ListingQuery} into `GET /v1/residences` query params. Pins
 * `api_version` so the response is the paginated envelope; every filter is
 * additive and omitted when unset (= no constraint). `limit`/`offset` are set by
 * the caller. Multi-value facets repeat the param (OR-combined server-side).
 * `includeSort` is false for the count-only request, where order is irrelevant.
 */
function buildResidenceParams(query: ListingQuery, includeSort = true): URLSearchParams {
  const params = new URLSearchParams();
  params.set('api_version', String(API_VERSION));
  if (query.dealType) params.set('deal_type', query.dealType);
  if (query.minPrice != null) params.set('min_price', String(query.minPrice));
  if (query.maxPrice != null) params.set('max_price', String(query.maxPrice));
  for (const type of query.buildingTypes ?? []) params.append('building_type', type);
  if (query.minBedrooms != null) params.set('min_bedrooms', String(query.minBedrooms));
  if (query.minBathrooms != null) params.set('min_bathrooms', String(query.minBathrooms));
  if (query.minAreaSqm != null) params.set('min_area_m2', String(query.minAreaSqm));
  if (query.maxAreaSqm != null) params.set('max_area_m2', String(query.maxAreaSqm));
  for (const label of query.energyLabels ?? []) params.append('energy_label', label);
  if (query.minBuildYear != null) params.set('min_build_year', String(query.minBuildYear));
  const apiStatus = query.status ? LISTING_TO_RESIDENCE_STATUS[query.status] : undefined;
  if (apiStatus) params.set('status', apiStatus);
  if (includeSort && query.sort) params.set('sort', query.sort);
  return params;
}

/** Unwrap the v2 envelope; tolerate a legacy bare array from an older backend. */
function pageItems(res: ResidenceOut[] | ResidencePage): ResidenceOut[] {
  return Array.isArray(res) ? res : res.items;
}

export async function getListings(query: ListingQuery = {}): Promise<Listing[]> {
  if (USE_LISTING_MOCKS) {
    return mockListings.filter((l) => matchesQuery(l, query));
  }
  const params = buildResidenceParams(query);
  params.set('limit', String(RESIDENCE_PAGE_SIZE));

  const res = await request<ResidenceOut[] | ResidencePage>(`/v1/residences?${params}`);
  // Only geocoded residences can be placed on the map.
  const listings = pageItems(res).filter(hasCoordinates).map(residenceToListing);
  // The API has no free-text search, so honor `search` client-side.
  return query.search ? listings.filter((l) => matchesQuery(l, { search: query.search })) : listings;
}

/**
 * Total residences matching `query`, independent of the marker page size. Uses
 * the API's count-only mode (`limit=0` → `{ total }`) so the filters screen can
 * show a truthful "Show N homes" badge without fetching a page of homes. In mock
 * mode it counts the bundled listings the same way {@link getListings} filters.
 */
export async function getListingsCount(query: ListingQuery = {}): Promise<number> {
  if (USE_LISTING_MOCKS) {
    return mockListings.filter((l) => matchesQuery(l, query)).length;
  }
  const params = buildResidenceParams(query, false);
  params.set('limit', '0');
  const res = await request<ResidenceOut[] | ResidencePage>(`/v1/residences?${params}`);
  return Array.isArray(res) ? res.length : res.total;
}

// --- Geographic shapes (cities & neighborhoods) -----------------------------

/**
 * Geometry encoding requested from every `/v1/shapes/*` endpoint. The client only
 * decodes GeoJSON today (see {@link toAreaGeometry}), so we send `geojson`
 * explicitly: it pins the wire contract for forward-compatibility, so adding a
 * server-side `topojson` option later can't change what already-shipped clients
 * receive. Widen to a typed union once the client can parse TopoJSON.
 */
const GEOM_FORMAT = 'geojson';

// --- Neighborhood area polygons ----------------------------------------------

/** CBS municipality code for Den Haag ('s-Gravenhage) — the default city. */
export const DEN_HAAG_CITY_CODE = '0518';

/** Display name for {@link DEN_HAAG_CITY_CODE}, shown alongside neighborhoods. */
export const DEN_HAAG_CITY_NAME = 'Den Haag';

/** Raw neighborhood shape as returned by `/v1/shapes/neighborhoods`. */
interface NeighborhoodShape {
  code: string;
  name: string;
  city_code: string;
  district_code: string;
  /**
   * Bare GeoJSON coordinates (no `type`): a Polygon's `Position[][]` or a
   * MultiPolygon's `Position[][][]`, the latter nested one level deeper.
   */
  geometry: number[][][] | number[][][][];
}

// Distinct, readable hues. Districts cycle through these in order of appearance
// so neighborhoods group by color. (Previously baked into the bundled dataset.)
const AREA_PALETTE = [
  '#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2',
  '#ca8a04', '#dc2626', '#4d7c0f', '#9333ea', '#0d9488', '#be123c',
];

/** Wrap the API's bare coordinates in a typed GeoJSON geometry. */
function toAreaGeometry(coords: NeighborhoodShape['geometry']): AreaPolygon['geometry'] {
  // MultiPolygon coordinates nest one level deeper than Polygon coordinates.
  const isMultiPolygon = Array.isArray((coords as number[][][][])[0]?.[0]?.[0]);
  return isMultiPolygon
    ? { type: 'MultiPolygon', coordinates: coords as number[][][][] }
    : { type: 'Polygon', coordinates: coords as number[][][] };
}

/** Map the API's neighborhood shapes to the compact `AreaPolygon` overlay shape. */
function shapesToAreas(shapes: NeighborhoodShape[]): AreaPolygon[] {
  const districtColor = new Map<string, string>();
  const colorFor = (district: string): string => {
    let color = districtColor.get(district);
    if (!color) {
      color = AREA_PALETTE[districtColor.size % AREA_PALETTE.length]!;
      districtColor.set(district, color);
    }
    return color;
  };

  return shapes.map((shape) => ({
    id: shape.code,
    name: shape.name,
    color: colorFor(shape.district_code),
    geometry: toAreaGeometry(shape.geometry),
  }));
}

/**
 * Neighborhood ("buurten") boundaries for a city (CBS municipality code, e.g.
 * `0518` for Den Haag), fetched from the Realty Alerts shapes API and
 * transformed into `AreaPolygon[]`. Returns an empty array when no backend is
 * configured (mock/offline builds) so the map renders without overlays rather
 * than failing. Boundaries never change, so the app caches the result per city
 * (see `loadAreas`).
 */
export async function getAreas(city: string = DEN_HAAG_CITY_CODE): Promise<AreaPolygon[]> {
  if (!API_URL) return [];
  const shapes = await request<NeighborhoodShape[]>(
    `/v1/shapes/neighborhoods?city=${encodeURIComponent(city)}&format=${GEOM_FORMAT}`,
  );
  return shapesToAreas(shapes);
}

// --- Cities (municipalities) -------------------------------------------------

/** Raw city shape as returned by `/v1/shapes/cities`. */
interface CityShapeResponse {
  code: string;
  name: string;
  /** Bare GeoJSON coordinates, like {@link NeighborhoodShape.geometry}. */
  geometry: number[][][] | number[][][][];
}

/** Page size we request. The endpoint is documented as capping `limit` at 200. */
const CITY_PAGE_SIZE = 200;

/**
 * All Dutch municipality ("gemeente") boundaries, fetched from the shapes API
 * and transformed into {@link CityShape}. Returns an empty array when no backend
 * is configured (mock/offline builds). Boundaries never change, so the app caches
 * the result (see `loadCities`).
 *
 * Pagination is defensive: we page through offsets, dedupe by `code`, and stop
 * when a page is short (a real last page) **or** when a page adds no new cities.
 * The second guard matters because the endpoint currently ignores `limit`/`offset`
 * and returns the full set (342 municipalities) on every call — a naive
 * "stop when page.length < limit" loop never terminates against it, which is what
 * left a cold-started app (empty city cache) unable to load any neighborhoods.
 */
export async function getCities(): Promise<CityShape[]> {
  if (!API_URL) return [];
  const byCode = new Map<string, CityShape>();
  for (let offset = 0; ; offset += CITY_PAGE_SIZE) {
    const page = await request<CityShapeResponse[]>(
      `/v1/shapes/cities?limit=${CITY_PAGE_SIZE}&offset=${offset}&format=${GEOM_FORMAT}`,
    );
    const before = byCode.size;
    for (const c of page) {
      byCode.set(c.code, { code: c.code, name: c.name, geometry: toAreaGeometry(c.geometry) });
    }
    if (page.length < CITY_PAGE_SIZE || byCode.size === before) break;
  }
  return [...byCode.values()];
}

/** A municipality's code + display name, as returned by `/v1/cities`. */
export interface CityName {
  /** CBS municipality code, e.g. `0518` for Den Haag ('s-Gravenhage). */
  code: string;
  name: string;
}

/**
 * All Dutch municipality names (code + name) from the lightweight `/v1/cities`
 * endpoint — no geometry, unlike {@link getCities}, so it's cheap to fetch and
 * search. Used by the onboarding city picker and its fuzzy search. Falls back to
 * a bundled sample ({@link mockCityNames}) when no backend is configured
 * (mock/offline builds and the deterministic web export), so the picker always
 * has content. The list never changes, so callers cache it for the session.
 */
export async function getCityNames(): Promise<CityName[]> {
  if (!API_URL) return mockCityNames;
  return request<CityName[]>('/v1/cities');
}

/** Raw stats entry from `/v1/stats/neighborhoods` (its `geometry` is dropped). */
interface NeighborhoodStatsShape {
  code: string;
  stats_year: number;
  stats: Record<string, number>;
}

/**
 * CBS statistics per neighborhood for a city, matched to areas by `code`.
 * Returns an empty array when no backend is configured. Like the boundaries,
 * the figures are static, so the app caches them per city (see `loadStats`).
 */
export async function getStats(city: string = DEN_HAAG_CITY_CODE): Promise<NeighborhoodStats[]> {
  if (!API_URL) return [];
  const entries = await request<NeighborhoodStatsShape[]>(
    `/v1/stats/neighborhoods?city=${encodeURIComponent(city)}`,
  );
  return entries.map((entry) => ({
    code: entry.code,
    statsYear: entry.stats_year,
    stats: entry.stats ?? {},
  }));
}

export async function getListing(id: string): Promise<Listing> {
  if (USE_LISTING_MOCKS) {
    const found = mockListings.find((l) => l.id === id);
    if (!found) throw new Error(`Listing ${id} not found`);
    return found;
  }
  // No public detail endpoint exists yet, so resolve the id against the list.
  const residences = await request<ResidenceOut[]>(
    `/v1/residences?limit=${RESIDENCE_PAGE_SIZE}`,
  );
  const found = residences.find((r) => String(r.id) === id);
  if (!found || !hasCoordinates(found)) throw new Error(`Listing ${id} not found`);
  return residenceToListing(found);
}
