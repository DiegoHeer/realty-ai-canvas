import { createPersistedListStore } from './persisted-list-store';
import { resultKey, type SearchResult } from './search';
import { StorageKeys } from './storage';

/**
 * Recently picked search results, newest first. We persist the whole
 * {@link SearchResult} (place coordinate, buurt codes, or the full home Listing)
 * so tapping a recent acts immediately — flying the map or reopening the home —
 * without another geocoder/backend round-trip. Deduped by {@link resultKey} so
 * the same place/buurt/home doesn't pile up.
 */
const store = createPersistedListStore<SearchResult>({
  key: StorageKeys.recentSearches,
  limit: 8,
  idOf: resultKey,
  // Drop entries from the pre-`kind` schema (a flat PDOK result with no
  // discriminant) so a device that persisted recents before this shape
  // shipped doesn't feed `resultKey`/`resultLabel` an unmatched `kind`,
  // which renders as `undefined` and collides as a duplicate React key.
  isValid: (result) =>
    result?.kind === 'place' || result?.kind === 'buurt' || result?.kind === 'residence',
});

export function useRecentSearches() {
  return {
    recentSearches: store.use(),
    addRecentSearch: store.add,
    removeRecentSearch: store.remove,
    clearRecentSearches: store.clear,
  };
}
