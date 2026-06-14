import type { AreaPolygon, Listing, ListingQuery } from '@realty/types';

import { API_BASE, USE_MOCKS } from './env';
import { mockAreas, mockListings } from './mocks';
import {
  hasCoordinates,
  LISTING_TO_RESIDENCE_STATUS,
  residenceToListing,
  type ResidenceOut,
} from './residences';

/** Max residences the API returns per request (the `limit` ceiling). */
const RESIDENCE_PAGE_SIZE = 100;

/**
 * Thin typed wrapper around `fetch`. Swap `USE_MOCKS` off (by setting
 * `EXPO_PUBLIC_API_URL`) and these functions hit the real backend instead.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function matchesQuery(listing: Listing, query: ListingQuery): boolean {
  if (query.status && listing.status !== query.status) return false;
  if (query.minPrice != null && listing.price < query.minPrice) return false;
  if (query.maxPrice != null && listing.price > query.maxPrice) return false;
  if (query.search) {
    const haystack = `${listing.title} ${listing.address.line1} ${listing.address.city}`.toLowerCase();
    if (!haystack.includes(query.search.toLowerCase())) return false;
  }
  return true;
}

export async function getListings(query: ListingQuery = {}): Promise<Listing[]> {
  if (USE_MOCKS) {
    return mockListings.filter((l) => matchesQuery(l, query));
  }
  const params = new URLSearchParams();
  // Price + status filter server-side; the API caps `limit` at 100.
  if (query.minPrice != null) params.set('min_price', String(query.minPrice));
  if (query.maxPrice != null) params.set('max_price', String(query.maxPrice));
  const apiStatus = query.status ? LISTING_TO_RESIDENCE_STATUS[query.status] : undefined;
  if (apiStatus) params.set('status', apiStatus);
  params.set('limit', String(RESIDENCE_PAGE_SIZE));

  const residences = await request<ResidenceOut[]>(`/v1/residences?${params}`);
  // Only geocoded residences can be placed on the map.
  const listings = residences.filter(hasCoordinates).map(residenceToListing);
  // The API has no free-text search, so honor `search` client-side.
  return query.search ? listings.filter((l) => matchesQuery(l, { search: query.search })) : listings;
}

export async function getAreas(): Promise<AreaPolygon[]> {
  if (USE_MOCKS) {
    return mockAreas;
  }
  // The Realty Alerts API exposes no area-boundary endpoint yet; render the map
  // without overlays rather than failing the request.
  return [];
}

export async function getListing(id: string): Promise<Listing> {
  if (USE_MOCKS) {
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
