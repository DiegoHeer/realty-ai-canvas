import type { AreaPolygon, ListingQuery, NeighborhoodStats } from '@realty/types';
import { useQuery } from '@tanstack/react-query';

import { DEN_HAAG_CITY_CODE, getAreas, getStats, getListing, getListings } from './client';

/** Centralised query keys so caches invalidate consistently. */
export const listingKeys = {
  all: ['listings'] as const,
  list: (query: ListingQuery) => ['listings', 'list', query] as const,
  detail: (id: string) => ['listings', 'detail', id] as const,
};

export function useListings(query: ListingQuery = {}) {
  return useQuery({
    queryKey: listingKeys.list(query),
    queryFn: () => getListings(query),
  });
}

export const areaKeys = {
  all: ['areas'] as const,
  city: (city: string) => ['areas', city] as const,
};

/**
 * Neighborhood boundaries for a city (CBS municipality code). `loader` defaults
 * to the network `getAreas`, but the app passes `loadAreas`, which caches the
 * result in AsyncStorage under the city code — so boundaries survive across
 * launches and the API is hit at most once per city. They never change, so the
 * query also never refetches within a session.
 */
export function useAreas(
  city: string = DEN_HAAG_CITY_CODE,
  loader: (city: string) => Promise<AreaPolygon[]> = getAreas,
) {
  return useQuery({
    queryKey: areaKeys.city(city),
    queryFn: () => loader(city),
    staleTime: Infinity,
  });
}

export const statsKeys = {
  all: ['stats'] as const,
  city: (city: string) => ['stats', city] as const,
};

/**
 * Neighborhood statistics for a city, matched to areas by `code`. Like
 * {@link useAreas}, `loader` defaults to the network `getStats` but the app
 * passes `loadStats` for permanent per-city AsyncStorage caching. Static data,
 * so it never refetches within a session.
 */
export function useStats(
  city: string = DEN_HAAG_CITY_CODE,
  loader: (city: string) => Promise<NeighborhoodStats[]> = getStats,
) {
  return useQuery({
    queryKey: statsKeys.city(city),
    queryFn: () => loader(city),
    staleTime: Infinity,
  });
}

export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: listingKeys.detail(id ?? ''),
    queryFn: () => getListing(id as string),
    enabled: !!id,
  });
}
