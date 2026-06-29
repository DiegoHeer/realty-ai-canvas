import { useSyncExternalStore } from 'react';

import { loadJSON, saveJSON, StorageKeys } from './storage';

/**
 * Progress through the intro tour, persisted to AsyncStorage so the user only
 * sees it once. `done` means the tour was completed *or* skipped — either way it
 * never auto-shows again (the gate in `app/_layout` only routes into it while
 * `status` is `pending`). `lastPage` records the furthest page reached so a user
 * who quits part-way resumes where they left off rather than restarting.
 *
 * Same in-memory `useSyncExternalStore` shape as `lib/filters` / `lib/appearance`:
 * a module-level value that hydrates from disk on boot and writes through on every
 * change. `hydrated` flips true once disk resolves, so the gate can wait for the
 * real value instead of acting on the `pending` default and flashing the tour at
 * a returning user.
 */
export type OnboardingStatus = 'pending' | 'done';

export interface OnboardingState {
  status: OnboardingStatus;
  /** Furthest page index reached (0-based), for resuming a partial run. */
  lastPage: number;
  /** True once the persisted value has been read from disk (or confirmed absent). */
  hydrated: boolean;
}

/** Persisted subset of {@link OnboardingState} (`hydrated` is runtime-only). */
interface StoredOnboarding {
  status: OnboardingStatus;
  lastPage: number;
}

let current: OnboardingState = { status: 'pending', lastPage: 0, hydrated: false };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  const stored: StoredOnboarding = { status: current.status, lastPage: current.lastPage };
  void saveJSON(StorageKeys.onboarding, stored);
}

/** Record the furthest page reached. Only ever moves forward (ignores going back). */
export function setOnboardingPage(page: number) {
  const lastPage = Math.max(current.lastPage, page);
  if (lastPage === current.lastPage) return;
  current = { ...current, lastPage };
  persist();
  emit();
}

/** Mark the tour finished (completed or skipped); it won't auto-show again. */
export function completeOnboarding() {
  if (current.status === 'done') return;
  current = { ...current, status: 'done' };
  persist();
  emit();
}

/** Re-arm the tour from the start — used by the profile "Replay intro" action. */
export function resetOnboarding() {
  current = { ...current, status: 'pending', lastPage: 0 };
  persist();
  emit();
}

let hydrated = false;

/** Load the saved progress and apply it. Safe to call repeatedly; runs once. */
export async function hydrateOnboarding() {
  if (hydrated) return;
  hydrated = true;
  const stored = await loadJSON<StoredOnboarding>(StorageKeys.onboarding);
  current = {
    status: stored?.status === 'done' ? 'done' : 'pending',
    lastPage: typeof stored?.lastPage === 'number' ? stored.lastPage : 0,
    hydrated: true,
  };
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

export function useOnboarding() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...state, setOnboardingPage, completeOnboarding, resetOnboarding };
}

// Restore saved progress as soon as the module is first imported (the root
// layout imports `useOnboarding`, so this runs at boot alongside the other stores).
void hydrateOnboarding();
