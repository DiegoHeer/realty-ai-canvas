import { useSyncExternalStore } from 'react';

import { loadJSON, saveJSON } from './storage';

/**
 * A most-recently-used (MRU) list backed by AsyncStorage. Adding an item moves
 * it to the front and dedupes by a stable id; the list is capped at `limit`.
 *
 * The store follows the same `useSyncExternalStore` shape as {@link useAuth}:
 * an in-memory value with subscribers, except it hydrates from disk on first
 * load and persists on every mutation. Hydration is async, so the list starts
 * empty and fills in once storage resolves (a render the subscribers pick up).
 */
export interface PersistedListStore<T> {
  /** React hook returning the current list (re-renders on change). */
  use: () => T[];
  /** Insert/refresh an item at the front. */
  add: (item: T) => void;
  /** Drop the item whose id matches. */
  remove: (id: string) => void;
  /** Empty the list. */
  clear: () => void;
}

export function createPersistedListStore<T>(opts: {
  key: string;
  limit: number;
  /** Stable identity used for dedupe; most-recent add wins and moves to front. */
  idOf: (item: T) => string;
}): PersistedListStore<T> {
  let items: T[] = [];
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) listener();
  }

  // Hydrate once on module load. Stored items already respect the cap, but we
  // re-slice in case `limit` shrank since the data was written.
  void loadJSON<T[]>(opts.key).then((stored) => {
    if (stored && stored.length) {
      items = stored.slice(0, opts.limit);
      emit();
    }
  });

  function persist() {
    void saveJSON(opts.key, items);
  }

  function add(item: T) {
    const id = opts.idOf(item);
    items = [item, ...items.filter((existing) => opts.idOf(existing) !== id)].slice(0, opts.limit);
    persist();
    emit();
  }

  function remove(id: string) {
    const next = items.filter((existing) => opts.idOf(existing) !== id);
    if (next.length === items.length) return;
    items = next;
    persist();
    emit();
  }

  function clear() {
    if (items.length === 0) return;
    items = [];
    persist();
    emit();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return items;
  }

  return {
    use: () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    add,
    remove,
    clear,
  };
}
