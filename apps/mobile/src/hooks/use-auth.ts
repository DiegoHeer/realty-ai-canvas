import { useSyncExternalStore } from 'react';

/**
 * Minimal mock auth. There is no backend yet, so this is an in-memory store
 * that lets the UI distinguish a signed-in user from an anonymous (guest)
 * visitor. Swap the store internals for a real session later — the
 * `useAuth()` shape is what screens depend on.
 */
export interface AuthUser {
  name: string;
  email: string;
  /** Optional avatar URL; falls back to initials when absent. */
  avatarUrl?: string;
}

const MOCK_USER: AuthUser = {
  name: 'Jeroen Esseveld',
  email: 'jeroen.esseveld@odido.nl',
};

// Start signed in so the populated design is visible; sign out to see the
// guest state.
let currentUser: AuthUser | null = MOCK_USER;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
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

/** Mock sign-in: drops the guest into the mock account. */
export function signIn() {
  currentUser = MOCK_USER;
  emit();
}

/** Mock sign-out: returns to the anonymous/guest state. */
export function signOut() {
  currentUser = null;
  emit();
}

export function useAuth() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { user, isAuthenticated: user !== null, signIn, signOut };
}
