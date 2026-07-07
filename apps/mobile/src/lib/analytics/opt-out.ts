import { useSyncExternalStore } from 'react';

import { loadJSON, saveJSON, StorageKeys } from '../storage';

/**
 * Whether the user has opted out of anonymous usage analytics, persisted to
 * AsyncStorage. Same in-memory `useSyncExternalStore` shape as
 * {@link useMapSettings}/{@link useAppearance} — an eagerly-readable store with
 * async hydration on boot, so `track()` can read the flag synchronously and a
 * saved choice is respected before the first event fires.
 *
 * Default is `false` (analytics on): consistent with the privacy screen's copy
 * that we measure anonymous in-app usage. The toggle there lets the user leave.
 */
let optedOut = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setOptedOut(value: boolean) {
  if (value === optedOut) return;
  optedOut = value;
  void saveJSON(StorageKeys.analyticsOptOut, value);
  emit();
}

/** Synchronous getter used by `track()` — reads the in-memory flag. */
export function isOptedOut(): boolean {
  return optedOut;
}

let hydrated = false;

/** Load the saved opt-out flag. Safe to call repeatedly; runs once. */
export async function hydrateOptOut() {
  if (hydrated) return;
  hydrated = true;
  const stored = await loadJSON<boolean>(StorageKeys.analyticsOptOut);
  if (typeof stored === 'boolean') optedOut = stored;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return optedOut;
}

export function useAnalyticsOptOut() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { optedOut: value, setOptedOut };
}

// Load any saved preference as early as the module is first imported (mirrors
// lib/appearance.ts / lib/map-settings.ts), so `track()` respects it at boot.
void hydrateOptOut();
