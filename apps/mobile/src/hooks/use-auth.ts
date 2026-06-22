import { useSyncExternalStore } from 'react';

import { loadJSON, removeKey, saveJSON, StorageKeys } from '@/lib/storage';

/**
 * Mock auth with a persisted session. There is no auth backend yet, so the
 * sign-in helpers below synthesize a session locally; what they have in common
 * is the {@link AuthUser} shape that screens depend on. Swap the helper bodies
 * for real network calls later — the store contract (and `useAuth()` return)
 * stays the same.
 *
 * Persistence mirrors `lib/appearance`: an in-memory `useSyncExternalStore`
 * value that hydrates from AsyncStorage on boot and writes through on every
 * change. The app starts signed-out so the login flow is the default state; a
 * previously stored session is restored once disk resolves.
 */
export interface AuthUser {
  name: string;
  email: string;
  /** Optional avatar URL; falls back to initials when absent. */
  avatarUrl?: string;
}

let currentUser: AuthUser | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Set (or clear) the session and write through to storage, best-effort. */
function setSession(user: AuthUser | null) {
  currentUser = user;
  if (user) void saveJSON(StorageKeys.session, user);
  else void removeKey(StorageKeys.session);
  emit();
}

let hydrated = false;

/**
 * Restore a saved session from disk and apply it. Safe to call repeatedly; runs
 * once. Skips if a session was already established in-memory (e.g. the user
 * signed in before hydration resolved).
 */
export async function hydrateAuth() {
  if (hydrated) return;
  hydrated = true;
  const stored = await loadJSON<AuthUser>(StorageKeys.session);
  if (stored && !currentUser) {
    currentUser = stored;
    emit();
  }
}

/**
 * Turn an email local-part into a display name: `jane.doe@x.com` → `Jane Doe`.
 * Used when a sign-in path gives us an email but no name (mock stand-in for the
 * profile a real backend would return).
 */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return email;
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');
}

/** Email sign-in (mock): establishes a session derived from the address. */
export function signInWithEmail(email: string) {
  const trimmed = email.trim();
  setSession({ name: nameFromEmail(trimmed), email: trimmed });
}

/** Email registration (mock): establishes a session for the new account. */
export function registerWithEmail(params: { name: string; email: string }) {
  setSession({ name: params.name.trim(), email: params.email.trim() });
}

/**
 * Google sign-in (mock). A real integration would launch the Google OAuth flow
 * (e.g. expo-auth-session) and exchange the result for a session; with no
 * backend we synthesize a Google-style account so the flow is demoable.
 */
export function signInWithGoogle() {
  setSession({ name: 'Google User', email: 'user@gmail.com' });
}

/**
 * Apple sign-in (mock). A real integration would use Sign in with Apple
 * (expo-apple-authentication, iOS) and exchange the identity token for a
 * session; with no backend we synthesize an Apple-style account.
 */
export function signInWithApple() {
  setSession({ name: 'Apple User', email: 'user@privaterelay.appleid.com' });
}

const MOCK_USER: AuthUser = {
  name: 'Jeroen Esseveld',
  email: 'jeroen.esseveld@odido.nl',
};

/** Mock sign-in into a fixed demo account (used by tests and demos). */
export function signIn() {
  setSession(MOCK_USER);
}

/** Sign out: clears the session (in memory and on disk). */
export function signOut() {
  setSession(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentUser;
}

export function useAuth() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    user,
    isAuthenticated: user !== null,
    signIn,
    signOut,
    signInWithEmail,
    registerWithEmail,
    signInWithGoogle,
    signInWithApple,
  };
}

// Restore any saved session as early as the module is first imported (the root
// layout imports `useAuth`, so this runs at boot alongside appearance hydration).
void hydrateAuth();
