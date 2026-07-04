import { useSyncExternalStore } from 'react';

import {
  AUTH_ENABLED,
  AuthError,
  coalescedRefresh,
  configureAuthInterceptor,
  getSession as authGetSession,
  login as authLogin,
  logout as authLogout,
  providerTokenLogin as authProviderTokenLogin,
  queryClient,
  refresh as authRefresh,
  requestPasswordReset as authRequestPasswordReset,
  resetPassword as authResetPassword,
  signup as authSignup,
  verifyEmail as authVerifyEmail,
  type AllauthFieldError,
  type AuthUserDto,
} from '@realty/data';
import { requestGoogleIdToken } from '@/lib/google-auth';
import {
  clearPendingReset,
  clearPendingSession,
  clearTokens,
  loadPendingReset,
  loadPendingSession,
  loadTokens,
  savePendingReset,
  savePendingSession,
  saveTokens,
} from '@/lib/secure-tokens';
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
 * When the backend returned structured field-level validation errors, the full
 * `fieldErrors` array is carried through so screens can render each message
 * under its `param`'s input (see `lib/auth-errors`).
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'invalid_code'
  | 'email_taken'
  | 'oauth_cancelled'
  | 'oauth_failed'
  | 'generic';
export type AuthOutcome =
  | { ok: true }
  | { ok: false; code: AuthErrorCode; fieldErrors?: AllauthFieldError[] }
  | { ok: 'verifyPending' };

interface UseAuthReturn {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signInWithEmail: (email: string, password?: string) => Promise<AuthOutcome>;
  registerWithEmail: (p: { name: string; email: string; password?: string }) => Promise<AuthOutcome>;
  verifyEmail: (code: string) => Promise<AuthOutcome>;
  requestPasswordReset: (email: string) => Promise<AuthOutcome>;
  resetPassword: (p: { code: string; password: string }) => Promise<AuthOutcome>;
  signOut: () => Promise<void>;
  signIn: () => void;
  signInWithGoogle: () => Promise<AuthOutcome>;
  signInWithApple: () => Promise<AuthOutcome>;
}

// ---------------------------------------------------------------------------
// Shared store primitives
// ---------------------------------------------------------------------------

let currentUser: AuthUser | null = null;
let accessToken: string | null = null;
let refreshToken: string | null = null;
let pendingSessionToken: string | null = null;
let pendingResetToken: string | null = null;
let pendingResetEmail: string | null = null;
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
  await clearPendingSession();
  await saveJSON(StorageKeys.session, user);
  emit();
}

/**
 * Map a thrown auth error to a stable {@link AuthErrorCode}. auth-client tags
 * the recognized cases (`invalid_credentials`, `invalid_code`, `email_taken`);
 * anything else (server error, network failure, unexpected shape) collapses to
 * `'generic'`.
 */
function codeFor(error: unknown): AuthErrorCode {
  if (
    error instanceof AuthError &&
    (error.code === 'invalid_credentials' ||
      error.code === 'invalid_code' ||
      error.code === 'email_taken' ||
      error.code === 'oauth_failed')
  ) {
    return error.code;
  }
  return 'generic';
}

/** The structured field errors a thrown {@link AuthError} carried, if any. */
function fieldErrorsOf(error: unknown): AllauthFieldError[] | undefined {
  return error instanceof AuthError ? error.fieldErrors : undefined;
}

/** Build a failure outcome that preserves both the stable code and field errors. */
function failure(error: unknown): AuthOutcome {
  return { ok: false, code: codeFor(error), fieldErrors: fieldErrorsOf(error) };
}

async function realSignIn(email: string, password: string): Promise<AuthOutcome> {
  try {
    const session = await authLogin({ email: email.trim(), password });
    await applySession(toAuthUser(session.user), session.tokens);
    return { ok: true };
  } catch (error) {
    return failure(error);
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
    // Persist so verification survives the app being backgrounded/evicted while
    // the user fetches the emailed code.
    await savePendingSession(result.sessionToken);
    return { ok: 'verifyPending' };
  } catch (error) {
    return failure(error);
  }
}

async function realVerify(code: string): Promise<AuthOutcome> {
  // Fall back to the persisted token if the process was evicted since register.
  const sessionToken = pendingSessionToken ?? (await loadPendingSession());
  if (!sessionToken) return { ok: false, code: 'generic' };
  pendingSessionToken = sessionToken;
  try {
    const session = await authVerifyEmail({
      code: code.trim(),
      sessionToken,
    });
    await applySession(toAuthUser(session.user), session.tokens);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Password reset step 1 (real): request the emailed code, stash the session token + email. */
async function realRequestPasswordReset(email: string): Promise<AuthOutcome> {
  const trimmedEmail = email.trim();
  try {
    const { sessionToken } = await authRequestPasswordReset({ email: trimmedEmail });
    pendingResetToken = sessionToken;
    pendingResetEmail = trimmedEmail;
    // Persist both so the reset survives the app being backgrounded/evicted while
    // the user fetches the emailed code — the reset call (step 2) needs the email
    // too, not just the session token.
    await savePendingReset({ sessionToken, email: trimmedEmail });
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Password reset step 2 (real): change the password, then sign in with it (auto-login). */
async function realResetPassword(code: string, password: string): Promise<AuthOutcome> {
  // Recover the session token + email from memory, falling back to the persisted
  // store if the process was evicted since the request. The token completes the
  // reset; the email signs the user in afterwards.
  let sessionToken = pendingResetToken;
  let email = pendingResetEmail;
  if (!sessionToken || !email) {
    const stored = await loadPendingReset();
    sessionToken = sessionToken ?? stored?.sessionToken ?? null;
    email = email ?? stored?.email ?? null;
  }
  if (!sessionToken || !email) return { ok: false, code: 'generic' };
  pendingResetToken = sessionToken;
  pendingResetEmail = email;
  try {
    await authResetPassword({ code: code.trim(), password, sessionToken });
    // Reset-by-code changes the password but does NOT authenticate (the backend's
    // ACCOUNT_LOGIN_ON_PASSWORD_RESET is off), so sign in with the new
    // credentials to land the user in the app — the auto-login UX. This also
    // confirms the reset actually took effect.
    const session = await authLogin({ email, password });
    await applySession(toAuthUser(session.user), session.tokens);
    pendingResetToken = null;
    pendingResetEmail = null;
    await clearPendingReset();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Google sign-in (real): run the browser OAuth round-trip for an id_token
 * (`lib/google-auth`), then trade it for a JWT session via allauth's
 * provider-token endpoint. Cancelling the browser sheet is reported as its own
 * code so the screens can show a soft "cancelled" message instead of an error.
 */
async function realSignInWithGoogle(): Promise<AuthOutcome> {
  const result = await requestGoogleIdToken();
  if (result.kind === 'cancelled') return { ok: false, code: 'oauth_cancelled' };
  if (result.kind === 'failed') return { ok: false, code: 'oauth_failed' };
  try {
    const session = await authProviderTokenLogin({
      provider: 'google',
      clientId: result.clientId,
      idToken: result.idToken,
    });
    await applySession(toAuthUser(session.user), session.tokens);
    return { ok: true };
  } catch (error) {
    return failure(error);
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
  pendingResetToken = null;
  pendingResetEmail = null;
  emit();
  await clearTokens();
  await clearPendingSession();
  await clearPendingReset();
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
  const tokens = await loadTokens();
  if (!tokens) return;
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
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
    // refresh manually — but through the SAME single-flight as the interceptor
    // (coalescedRefresh), so a concurrent /v1 401 and this boot refresh don't
    // both consume the rotating refresh token and sign out a healthy session.
    // On success retry once (which also repopulates currentUser when the cached
    // session was absent); realRefresh tears the session down on its own failure.
    const newAccess = await coalescedRefresh();
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

// The email captured during a mock password-reset request, so the reset step can
// synthesize a session for it (the auto-login UX a real backend would return).
let mockResetEmail: string | null = null;

/** Password reset step 1 (mock): remember the email to sign in on reset. */
function mockRequestPasswordReset(email: string) {
  mockResetEmail = email.trim();
}

/** Password reset step 2 (mock): auto-sign-in the account whose reset was requested. */
function mockResetPassword() {
  const email = mockResetEmail ?? 'user@example.com';
  mockSetSession({ name: nameFromEmail(email), email });
  mockResetEmail = null;
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
  email: 'jeroen_esseveld@hotmail.com',
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

export function requestPasswordReset(email: string): Promise<AuthOutcome> {
  if (AUTH_ENABLED) return realRequestPasswordReset(email);
  mockRequestPasswordReset(email);
  return Promise.resolve({ ok: true });
}

export function resetPassword(p: { code: string; password: string }): Promise<AuthOutcome> {
  if (AUTH_ENABLED) return realResetPassword(p.code, p.password);
  mockResetPassword();
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

export function signInWithGoogle(): Promise<AuthOutcome> {
  if (AUTH_ENABLED) return realSignInWithGoogle();
  mockSignInWithGoogle();
  return Promise.resolve({ ok: true });
}

/**
 * Apple sign-in. Real mode is not wired yet (no Apple provider on the backend
 * — see docs/oauth-social-login.md); the screens never surface the Apple
 * button in real mode, so the failure outcome is just a safety net.
 */
export function signInWithApple(): Promise<AuthOutcome> {
  if (AUTH_ENABLED) return Promise.resolve({ ok: false, code: 'oauth_failed' });
  mockSignInWithApple();
  return Promise.resolve({ ok: true });
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
    requestPasswordReset,
    resetPassword,
    signOut,
    signIn,
    signInWithGoogle,
    signInWithApple,
  };
}

// Wire the auth interceptor SYNCHRONOUSLY at module load (before the async
// token read in realHydrate), so a /v1 request mounting during boot always
// finds an interceptor — it sends the Bearer once tokens load and can refresh
// on 401, instead of silently going unauthenticated in that window.
if (AUTH_ENABLED) {
  configureAuthInterceptor({ getAccessToken: () => accessToken, refresh: realRefresh });
}

// Boot hydration: real or mock.
void (AUTH_ENABLED ? realHydrate() : mockHydrateAuth());
