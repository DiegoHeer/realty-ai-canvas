import { useSyncExternalStore } from 'react';

/** A city the map should focus on once, e.g. one chosen during the intro tour. */
export interface MapFocusTarget {
  /** CBS municipality code, matched against the loaded city shapes. */
  code: string;
  name: string;
}

let pending: MapFocusTarget | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Ask the map to focus on a city the next time it mounts. In-memory only (never
 * persisted): the map consumes the target once and clears it, so it doesn't
 * re-fire on every launch. Set from the onboarding tour when the user picks
 * cities — the map flies to the first one and selects it so its neighborhoods load.
 */
export function setMapFocus(target: MapFocusTarget | null) {
  pending = target;
  emit();
}

/** Clear the pending focus once the map has acted on it. */
export function clearMapFocus() {
  if (pending === null) return;
  pending = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return pending;
}

export function useMapFocus() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
