import { createPersistedListStore } from './persisted-list-store';
import type { GeocodeResult } from './pdok';
import { StorageKeys } from './storage';

/**
 * Recently resolved search locations, newest first. We persist the full
 * {@link GeocodeResult} (not just the label) so tapping a recent flies the map
 * straight there without another geocoder round-trip. Deduped by label+type so
 * the same place doesn't pile up.
 */
const store = createPersistedListStore<GeocodeResult>({
  key: StorageKeys.recentSearches,
  limit: 8,
  idOf: (result) => `${result.label}|${result.type}`,
});

export function useRecentSearches() {
  return {
    recentSearches: store.use(),
    addRecentSearch: store.add,
    removeRecentSearch: store.remove,
    clearRecentSearches: store.clear,
  };
}
