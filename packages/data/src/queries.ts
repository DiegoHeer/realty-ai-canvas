import type { ListingQuery } from '@realty/types';
import { useQuery } from '@tanstack/react-query';

import { getAreas, getListing, getListings } from './client';

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
};

export function useAreas() {
  return useQuery({
    queryKey: areaKeys.all,
    queryFn: getAreas,
    staleTime: Infinity, // Boundaries are static; never refetch in a session.
  });
}

export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: listingKeys.detail(id ?? ''),
    queryFn: () => getListing(id as string),
    enabled: !!id,
  });
}
