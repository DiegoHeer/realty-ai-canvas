import type {
  AreaPolygon,
  CityShape,
  ElectionResult,
  Listing,
  ListingQuery,
  NeighborhoodStats,
} from '@realty/types';

import { API_BASE, API_URL, API_VERSION } from './env';
import {
  hasCoordinates,
  LISTING_TO_RESIDENCE_STATUS,
  residenceToListing,
  summaryToListing,
  type ResidenceOut,
  type ResidencePage,
  type ResidenceSummaryOut,
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

/** Thin typed wrapper around `fetch` that targets the configured backend. */
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

/** Case-insensitive substring match over a listing's title + address. */
function matchesSearch(listing: Listing, search: string): boolean {
  const haystack = `${listing.title} ${listing.address.line1} ${listing.address.city}`.toLowerCase();
  return haystack.includes(search.toLowerCase());
}

/**
 * Translate a {@link ListingQuery} into `GET /v1/residences` query params. Pins
 * `api_version` so older backends also return the paginated envelope (current
 * ones always do and ignore the param); every filter is additive and omitted
 * when unset (= no constraint). `limit`/`offset` are set by the caller.
 * Multi-value facets repeat the param (OR-combined server-side). `includeSort`
 * is false for the count-only request, where order is irrelevant.
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

/** Unwrap the envelope; tolerate a legacy bare array from an older backend. */
function pageItems(res: ResidenceSummaryOut[] | ResidencePage): ResidenceSummaryOut[] {
  return Array.isArray(res) ? res : res.items;
}

export async function getListings(query: ListingQuery = {}): Promise<Listing[]> {
  const params = buildResidenceParams(query);
  params.set('limit', String(RESIDENCE_PAGE_SIZE));

  const res = await request<ResidenceSummaryOut[] | ResidencePage>(`/v1/residences?${params}`);
  // Only geocoded residences can be placed on the map.
  const listings = pageItems(res).filter(hasCoordinates).map(summaryToListing);
  // The API has no free-text search, so honor `search` client-side.
  return query.search ? listings.filter((l) => matchesSearch(l, query.search!)) : listings;
}

/**
 * Total residences matching `query`, independent of the marker page size. Uses
 * the API's count-only mode (`limit=0` → `{ total }`) so the filters screen can
 * show a truthful "Show N homes" badge without fetching a page of homes.
 */
export async function getListingsCount(query: ListingQuery = {}): Promise<number> {
  const params = buildResidenceParams(query, false);
  params.set('limit', '0');
  const res = await request<ResidenceSummaryOut[] | ResidencePage>(`/v1/residences?${params}`);
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
 * configured, so the map renders without overlays rather than failing.
 * Boundaries never change, so the app caches the result per city
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
 * is configured. Boundaries never change, so the app caches
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
 * search. Used by the onboarding city picker and its fuzzy search. Returns an
 * empty array when no backend is configured. The list never changes, so callers
 * cache it for the session.
 */
export async function getCityNames(): Promise<CityName[]> {
  if (!API_URL) return [];
  return request<CityName[]>('/v1/cities');
}

/** Raw per-period election block: `{ tk2025: { parties, totalVotes, ... } }`. */
interface ElectionStatsShape {
  source?: string;
  totalVotes?: number;
  parties?: Record<string, number>;
}

/** Raw stats entry from `/v1/stats/neighborhoods` (its `geometry` is dropped). */
interface NeighborhoodStatsShape {
  code: string;
  stats_year: number;
  stats: Record<string, number>;
  election_stats?: Record<string, ElectionStatsShape> | null;
}

/**
 * Pick the most recent election period from a raw `election_stats` block and
 * shape it into an {@link ElectionResult}. Periods are keyed like `tk2025`, so
 * the lexicographically-greatest key is the newest. Returns `null` when there
 * are no periods or the newest one has no vote counts.
 */
function toElectionResult(
  raw: Record<string, ElectionStatsShape> | null | undefined,
): ElectionResult | null {
  if (!raw) return null;
  const period = Object.keys(raw).sort().at(-1);
  if (!period) return null;
  const block = raw[period];
  const parties = block?.parties;
  const totalVotes = block?.totalVotes;
  if (!parties || typeof totalVotes !== 'number' || totalVotes <= 0) return null;
  return { period, source: block?.source ?? '', totalVotes, parties };
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
    election: toElectionResult(entry.election_stats),
  }));
}

export async function getListing(id: string): Promise<Listing> {
  // The detail endpoint returns the full residence — source listings,
  // foundation risk, timestamps — which the summary list items no longer carry.
  const found = await request<ResidenceOut>(`/v1/residences/${encodeURIComponent(id)}`);
  if (!hasCoordinates(found)) throw new Error(`Listing ${id} not found`);
  return residenceToListing(found);
}

// --- Feedback ----------------------------------------------------------------

/** Platform tag on submitted feedback; mirrors the backend `FeedbackPlatform`. */
export type FeedbackPlatform = 'ios' | 'android' | 'web';

/**
 * Body for `POST /v1/feedback`. Only `message` is required; the rest is optional
 * context the app attaches for triage. Spec:
 * https://api-staging.realty-ai.nl/docs#/feedback/scraping_api_submit_feedback
 */
export interface FeedbackIn {
  message: string;
  /** App version string; the backend caps this at 20 characters. */
  app_version?: string | null;
  platform?: FeedbackPlatform | null;
  /**
   * UI language code the app is running in (e.g. `en`). Left as a free string so
   * new languages flow through without changing this type — the app's supported
   * set is the single source of truth in `@realty/i18n`.
   */
  locale?: string | null;
}

/** `201` acknowledgement returned when feedback is stored. */
export interface FeedbackAck {
  id: number;
  created_at: string;
}

/**
 * Submit user feedback. The endpoint is public (no auth required); we still route
 * through `request()` for consistent base-URL handling. A Bearer token is sent
 * when the user happens to be signed in and is ignored by the server otherwise.
 */
export async function submitFeedback(input: FeedbackIn): Promise<FeedbackAck> {
  return request<FeedbackAck>('/v1/feedback', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// --- Account deletion --------------------------------------------------------

/** Stable reasons {@link deleteAccount} can fail, mapped from the backend's 403 `detail`. */
export type DeleteAccountErrorCode =
  | 'password_incorrect'
  | 'reauthentication_required'
  | 'staff_account'
  | 'generic';

/** A handled account-deletion failure carrying a stable {@link DeleteAccountErrorCode}. */
export class DeleteAccountError extends Error {
  code: DeleteAccountErrorCode;
  constructor(code: DeleteAccountErrorCode) {
    super(`Account deletion failed: ${code}`);
    this.name = 'DeleteAccountError';
    this.code = code;
  }
}

const DELETE_ACCOUNT_CODES = [
  'password_incorrect',
  'reauthentication_required',
  'staff_account',
] as const;

/**
 * Permanently delete the signed-in user's OWN account (`DELETE /v1/me/account`).
 *
 * The account is derived server-side from the Bearer token — it is never sent by
 * the client, so this can only ever delete the caller's own account. `password`
 * re-authenticates password accounts; social (Google) accounts prove identity by
 * re-authenticating (a fresh provider-token login) immediately before this call
 * and omit it. A recognized rejection (wrong password, missing re-auth, staff
 * account) throws a {@link DeleteAccountError} with a stable `code`; anything else
 * throws a generic one.
 *
 * Unlike {@link request}, this is hand-rolled because the endpoint replies `204`
 * (no JSON body to parse) and encodes failures as `403` with a `detail` code we
 * need to surface. A real `401` here means an expired access token (re-auth
 * failures are `403`), so we refresh once and retry, mirroring `request()`.
 */
export async function deleteAccount(input: { password?: string } = {}): Promise<void> {
  const send = (token: string | null) => {
    const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    return fetch(`${API_BASE}/v1/me/account`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ password: input.password }),
    });
  };

  let res = await send(authInterceptor?.getAccessToken() ?? null);
  if (res.status === 401 && authInterceptor) {
    const newToken = await refreshOnce();
    if (!newToken) throw new DeleteAccountError('generic');
    res = await send(newToken);
  }

  if (res.status === 204) return;

  if (res.status === 403) {
    let detail: string | undefined;
    try {
      detail = ((await res.json()) as { detail?: string }).detail;
    } catch {
      // Non-JSON body — fall through to a generic failure.
    }
    const code = DELETE_ACCOUNT_CODES.find((c) => c === detail) ?? 'generic';
    throw new DeleteAccountError(code);
  }

  throw new DeleteAccountError('generic');
}
