import { useSyncExternalStore } from 'react';

import {
  AUTH_ENABLED,
  AuthError,
  configureAuthInterceptor,
  getSession as authGetSession,
  login as authLogin,
  logout as authLogout,
  queryClient,
  refresh as authRefresh,
  signup as authSignup,
  verifyEmail as authVerifyEmail,
  type AuthUserDto,
} from '@realty/data';
import { clearTokens, loadTokens, saveTokens } from '@/lib/secure-tokens';
import { loadJSON, removeKey, saveJSON, StorageKeys } from '@/lib/storage';

/**
 * Auth store gated by `AUTH_ENABLED`:
 *   - `false` (default / visual-regression path): mock helpers synthesize sessions locally.
 *   - `true`: real backend auth via allauth headless JWT.
 *
 * Screens depend only on `useAuth()` (the hook) and the `AuthUser` type. The
 * `getCurrentUser()` helper is exported for unit tests only.
 */
export interface AuthUser {
  name: string;
  email: string;
  /** Optional avatar URL; falls back to initials when absent. */
  avatarUrl?: string;
}

/**
 * Result of an auth action. A failure carries a stable `code` (not a message),
 * so the UI can localize it; `'generic'` covers unexpected/unmapped failures.
 */
export type AuthErrorCode = 'invalid_credentials' | 'invalid_code' | 'generic';
export type AuthOutcome =
  | { ok: true }
  | { ok: false; code: AuthErrorCode }
  | { ok: 'verifyPending' };

interface UseAuthReturn {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signInWithEmail: (email: string, password?: string) => Promise<AuthOutcome>;
  registerWithEmail: (p: { name: string; email: string; password?: string }) => Promise<AuthOutcome>;
  verifyEmail: (code: string) => Promise<AuthOutcome>;
  signOut: () => Promise<void>;
  signIn: () => void;
  signInWithGoogle: () => void;
  signInWithApple: () => void;
}

// ---------------------------------------------------------------------------
// Shared store primitives
// ---------------------------------------------------------------------------

let currentUser: AuthUser | null = null;
let accessToken: string | null = null;
let refreshToken: string | null = null;
let pendingSessionToken: string | null = null;
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

/** Test helper: returns the current in-memory user without rendering. */
export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

// ---------------------------------------------------------------------------
// Real-mode helpers
// ---------------------------------------------------------------------------

function toAuthUser(dto: AuthUserDto): AuthUser {
  return { name: dto.name, email: dto.email };
}

/** Apply a signed-in session: user + tokens, persisted to disk + keychain. */
async function applySession(
  user: AuthUser,
  tokens: { accessToken: string; refreshToken: string },
) {
  currentUser = user;
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  pendingSessionToken = null;
  await saveTokens(tokens);
  await saveJSON(StorageKeys.session, user);
  emit();
}

/**
 * Map a thrown auth error to a stable {@link AuthErrorCode}. auth-client tags
 * the recognized cases (`invalid_credentials`, `invalid_code`); anything else
 * (server error, network failure, unexpected shape) collapses to `'generic'`.
 */
function codeFor(error: unknown): AuthErrorCode {
  if (error instanceof AuthError && (error.code === 'invalid_credentials' || error.code === 'invalid_code')) {
    return error.code;
  }
  return 'generic';
}

async function realSignIn(email: string, password: string): Promise<AuthOutcome> {
  try {
    const session = await authLogin({ email: email.trim(), password });
    await applySession(toAuthUser(session.user), session.tokens);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: codeFor(error) };
  }
}

async function realRegister(p: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthOutcome> {
  try {
    const result = await authSignup({
      name: p.name.trim(),
      email: p.email.trim(),
      password: p.password,
    });
    if (result.kind === 'authenticated') {
      await applySession(toAuthUser(result.session.user), result.session.tokens);
      return { ok: true };
    }
    pendingSessionToken = result.sessionToken;
    return { ok: 'verifyPending' };
  } catch (error) {
    return { ok: false, code: codeFor(error) };
  }
}

async function realVerify(code: string): Promise<AuthOutcome> {
  if (!pendingSessionToken) return { ok: false, code: 'generic' };
  try {
    const session = await authVerifyEmail({
      code: code.trim(),
      sessionToken: pendingSessionToken,
    });
    await applySession(toAuthUser(session.user), session.tokens);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: codeFor(error) };
  }
}

/** Interceptor refresh: rotate tokens, or tear down the session on failure. */
async function realRefresh(): Promise<string | null> {
  if (!refreshToken) return null;
  try {
    const tokens = await authRefresh(refreshToken);
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    await saveTokens(tokens);
    return tokens.accessToken;
  } catch {
    await realSignOut();
    return null;
  }
}

async function realSignOut(): Promise<void> {
  const token = accessToken;
  currentUser = null;
  accessToken = null;
  refreshToken = null;
  pendingSessionToken = null;
  emit();
  await clearTokens();
  await removeKey(StorageKeys.session);
  queryClient.clear();
  if (token) {
    // Fire-and-forget: never block sign-out (or a refresh-triggered teardown)
    // on the network round-trip.
    void authLogout(token).catch(() => {});
  }
}

let hydrated = false;

async function realHydrate() {
  if (hydrated) return;
  hydrated = true;
  // Load persisted tokens and set them BEFORE wiring the interceptor, so a /v1
  // request firing during hydration sees the access token rather than null
  // (which would cause a spurious 401 → refresh with a null refresh token).
  const tokens = await loadTokens();
  if (tokens) {
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  }
  configureAuthInterceptor({ getAccessToken: () => accessToken, refresh: realRefresh });
  if (!tokens) return;
  const cached = await loadJSON<AuthUser>(StorageKeys.session);
  if (cached) {
    currentUser = cached;
    emit();
  }
  try {
    const dto = await authGetSession(tokens.accessToken);
    currentUser = toAuthUser(dto);
    await saveJSON(StorageKeys.session, currentUser);
    emit();
  } catch {
    // Access token likely expired. getSession bypasses the /v1 interceptor, so
    // refresh manually: realRefresh() rotates tokens (and tears the session
    // down + returns null on its own failure). If it succeeds, retry once —
    // which also repopulates currentUser when the cached session was absent.
    const newAccess = await realRefresh();
    if (newAccess) {
      try {
        const dto = await authGetSession(newAccess);
        currentUser = toAuthUser(dto);
        await saveJSON(StorageKeys.session, currentUser);
        emit();
      } catch {
        await realSignOut();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Mock-mode helpers (unchanged from original; used by visual-regression path)
// ---------------------------------------------------------------------------

/** Set (or clear) the session and write through to storage, best-effort. */
function mockSetSession(user: AuthUser | null) {
  currentUser = user;
  if (user) void saveJSON(StorageKeys.session, user);
  else void removeKey(StorageKeys.session);
  emit();
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
function mockSignInWithEmail(email: string) {
  const trimmed = email.trim();
  mockSetSession({ name: nameFromEmail(trimmed), email: trimmed });
}

/** Email registration (mock): establishes a session for the new account. */
function mockRegisterWithEmail(params: { name: string; email: string }) {
  mockSetSession({ name: params.name.trim(), email: params.email.trim() });
}

/**
 * Google sign-in (mock). A real integration would launch the Google OAuth flow
 * (e.g. expo-auth-session) and exchange the result for a session; with no
 * backend we synthesize a Google-style account so the flow is demoable.
 */
function mockSignInWithGoogle() {
  mockSetSession({ name: 'Google User', email: 'user@gmail.com' });
}

/**
 * Apple sign-in (mock). A real integration would use Sign in with Apple
 * (expo-apple-authentication, iOS) and exchange the identity token for a
 * session; with no backend we synthesize an Apple-style account.
 */
function mockSignInWithApple() {
  mockSetSession({ name: 'Apple User', email: 'user@privaterelay.appleid.com' });
}

const MOCK_USER: AuthUser = {
  name: 'Jeroen Esseveld',
  email: 'jeroen.esseveld@odido.nl',
};

/** Mock sign-in into a fixed demo account (used by tests and demos). */
function mockSignIn() {
  mockSetSession(MOCK_USER);
}

/** Mock sign-out: clears the session (in memory and on disk). */
function mockSignOut() {
  mockSetSession(null);
}

async function mockHydrateAuth() {
  if (hydrated) return;
  hydrated = true;
  const stored = await loadJSON<AuthUser>(StorageKeys.session);
  if (stored && !currentUser) {
    currentUser = stored;
    emit();
  }
}

// ---------------------------------------------------------------------------
// Module-level API helpers (gated by AUTH_ENABLED)
// These are also exported as named exports so real-mode tests can call them
// directly without going through the hook (no renderHook needed).
// ---------------------------------------------------------------------------

export function signInWithEmail(email: string, password?: string): Promise<AuthOutcome> {
  if (AUTH_ENABLED) return realSignIn(email, password ?? '');
  mockSignInWithEmail(email);
  return Promise.resolve({ ok: true });
}

export function registerWithEmail(p: {
  name: string;
  email: string;
  password?: string;
}): Promise<AuthOutcome> {
  if (AUTH_ENABLED) return realRegister({ name: p.name, email: p.email, password: p.password ?? '' });
  mockRegisterWithEmail(p);
  return Promise.resolve({ ok: true });
}

export function verifyEmail(code: string): Promise<AuthOutcome> {
  if (AUTH_ENABLED) return realVerify(code);
  return Promise.resolve({ ok: true });
}

export function signOut(): Promise<void> {
  if (AUTH_ENABLED) return realSignOut();
  mockSignOut();
  return Promise.resolve();
}

/** Demo sign-in (mock mode only). No-op in real mode — social buttons removed in a later task. */
export function signIn(): void {
  if (!AUTH_ENABLED) mockSignIn();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): UseAuthReturn {
  const user = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    user,
    isAuthenticated: user !== null,
    signInWithEmail,
    registerWithEmail,
    verifyEmail,
    signOut,
    // Social sign-in: no-ops in real mode (removed when backend OAuth lands); mock behavior in mock mode.
    signIn,
    signInWithGoogle: AUTH_ENABLED ? () => {} : mockSignInWithGoogle,
    signInWithApple: AUTH_ENABLED ? () => {} : mockSignInWithApple,
  };
}

// Boot hydration: real or mock.
void (AUTH_ENABLED ? realHydrate() : mockHydrateAuth());
