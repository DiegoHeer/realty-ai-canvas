import type { Listing } from '@realty/types';

import { createPersistedListStore } from './persisted-list-store';
import { StorageKeys } from './storage';

/**
 * Recently opened listings, newest first. We snapshot the whole {@link Listing}
 * so the "Recently viewed" carousel renders instantly from disk without
 * refetching — the data is a cache that's refreshed each time the user reopens
 * the detail screen. Deduped by listing id.
 */
const store = createPersistedListStore<Listing>({
  key: StorageKeys.recentViews,
  limit: 12,
  idOf: (listing) => listing.id,
});

/** Record (or refresh) a listing as recently viewed. Call when a detail loads. */
export const recordRecentView = store.add;

/** Forget every recently viewed listing. */
export const clearRecentViews = store.clear;

export function useRecentViews() {
  return {
    recentViews: store.use(),
    clearRecentViews,
  };
}
