import { colorScheme } from 'nativewind';
import { useSyncExternalStore } from 'react';
import { Appearance as RNAppearance, Platform } from 'react-native';

import { loadJSON, saveJSON, StorageKeys } from './storage';

export type Appearance = 'system' | 'light' | 'dark';

/**
 * The app's appearance preference, persisted to AsyncStorage and applied to the
 * whole UI. Each value drives two sinks (see {@link applyAppearance}):
 *   - NativeWind's `colorScheme`, which themes every `dark:` class (the GUI).
 *   - RN's `Appearance`, which themes native surfaces (native text and the
 *     expo-router Stack/header) so they don't clash with an override.
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

// Resolve a preference to a concrete scheme, reading the live OS scheme for
// 'system'. NativeWind's web dark mode is the `class` strategy, where the only
// thing that toggles the `dark` HTML class — and thus every `dark:` rule — is an
// explicit `colorScheme.set('dark')`. Passing 'system' just *removes* the class
// and never re-adds it for an OS-dark preference (it only updates NativeWind's JS
// observable), so on web the GUI would stay light while the map, which reads RN's
// `useColorScheme()`, goes dark. Feeding NativeWind the resolved scheme keeps the
// two in lock-step. On native this is equivalent to NativeWind's own 'system'.
function resolveScheme(value: Appearance): 'light' | 'dark' {
  if (value !== 'system') return value;
  return RNAppearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function applyAppearance(value: Appearance) {
  // Theme native surfaces (native text, the expo-router Stack/header) via RN's
  // Appearance. Native-only: react-native-web has no `setColorScheme`, and on web
  // every surface is themed by NativeWind's colorScheme below. Set first so a
  // 'system' resolve reads the OS scheme, not a previously-forced override. This
  // RN build represents "follow the system" as 'unspecified'.
  if (Platform.OS !== 'web') {
    RNAppearance.setColorScheme(value === 'system' ? 'unspecified' : value);
  }
  colorScheme.set(resolveScheme(value));
}

// In 'system' mode the resolved scheme tracks the OS, so re-sync NativeWind when
// the OS scheme flips (RN's appearance change also fires for the web media query).
// NativeWind doesn't bridge this itself under the `class` strategy — see
// resolveScheme. Explicit light/dark ignore the OS, so this is a no-op for them.
RNAppearance.addChangeListener(() => {
  if (current === 'system') colorScheme.set(resolveScheme('system'));
});

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
  if (stored && stored !== current) current = stored;
  // Apply once on boot even for the default 'system' (no stored override): on web
  // NativeWind's `dark` class is never set from the OS scheme on its own, so a
  // 'system'-in-OS-dark user would otherwise get a light GUI over a dark map (see
  // resolveScheme). Skipped only during the static web export's SSR pass, where
  // there's no `window` and colorScheme.set() throws; native always applies.
  if (Platform.OS !== 'web' || typeof window !== 'undefined') applyAppearance(current);
  emit();
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
