import type { Listing } from '@realty/types';

import { trackListingFavorited } from './analytics/events';
import { createPersistedListStore } from './persisted-list-store';
import { StorageKeys } from './storage';

/**
 * Listings the user has liked via the heart toggle (surfaced as "favorites" in
 * the UI). Like {@link recordRecentView}, we snapshot the whole {@link Listing}
 * so a future "Saved" view can render from disk without refetching. Deduped by
 * id, most-recently-liked first.
 *
 * The cap is a generous storage safety-bound, not a product limit — it sits far
 * above any realistic number of saves; if ever exceeded, the least-recently
 * liked drops first (the same MRU eviction recent-views uses).
 */
const store = createPersistedListStore<Listing>({
  key: StorageKeys.likes,
  limit: 200,
  idOf: (listing) => listing.id,
});

/** Like the listing if it isn't liked yet, otherwise remove it. */
export function toggleLike(listing: Listing): void {
  if (store.has(listing.id)) {
    store.remove(listing.id);
  } else {
    store.add(listing);
    trackListingFavorited();
  }
}

/** Reactive: whether this listing id is currently liked. */
export function useIsLiked(id: string): boolean {
  return store.use().some((listing) => listing.id === id);
}

/** Forget every liked listing (e.g. a "clear favorites" action). */
export const clearLikes = store.clear;

/** Liked listings, newest first — for a "Saved" view; plus a clear-all. */
export function useLikes() {
  return {
    likes: store.use(),
    clearLikes,
  };
}
