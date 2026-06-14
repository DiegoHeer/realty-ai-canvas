import { colorScheme } from 'nativewind';
import { useSyncExternalStore } from 'react';
import { Appearance as RNAppearance } from 'react-native';

import { loadJSON, saveJSON, StorageKeys } from './storage';

export type Appearance = 'system' | 'light' | 'dark';

/**
 * The app's appearance preference, persisted to AsyncStorage and applied to the
 * whole UI. Each value drives two sinks (see {@link applyAppearance}):
 *   - NativeWind's `colorScheme`, which themes every `dark:` class (the GUI).
 *   - RN's `Appearance`, which themes native surfaces (the `@expo/ui` sheets,
 *     native text, the expo-router Stack) so they don't clash with an override.
 *
 * Same in-memory `useSyncExternalStore` shape as {@link useAuth}, plus async
 * hydration on boot so a saved override is re-applied before the user sees the
 * default. `'system'` users hydrate to a no-op.
 */
let current: Appearance = 'system';
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function applyAppearance(value: Appearance) {
  colorScheme.set(value);
  // This RN build represents "follow the system" as 'unspecified'.
  RNAppearance.setColorScheme(value === 'system' ? 'unspecified' : value);
}

export function setAppearance(value: Appearance) {
  if (value === current) return;
  current = value;
  applyAppearance(value);
  void saveJSON(StorageKeys.appearance, value);
  emit();
}

let hydrated = false;

/** Load the saved appearance and apply it. Safe to call repeatedly; runs once. */
export async function hydrateAppearance() {
  if (hydrated) return;
  hydrated = true;
  const stored = await loadJSON<Appearance>(StorageKeys.appearance);
  if (stored && stored !== current) {
    current = stored;
    applyAppearance(stored);
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return current;
}

export function useAppearance() {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { appearance, setAppearance };
}

// Apply any saved override as early as the module is first imported (the root
// layout imports this for boot-time application).
void hydrateAppearance();
