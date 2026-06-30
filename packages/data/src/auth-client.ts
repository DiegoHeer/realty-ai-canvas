import { API_BASE } from './env';

/** allauth headless app-client base (HEADLESS_CLIENTS=("app",)). */
const AUTH_BASE = `${API_BASE}/_allauth/app/v1`;

export interface AuthUserDto {
  id: number;
  email: string;
  /** Display name from signup (backend stores it on User.first_name). */
  name: string;
  /** allauth-derived fields; the app prefers `name`. */
  display?: string;
  username?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession {
  user: AuthUserDto;
  tokens: AuthTokens;
}

export type SignupResult =
  | { kind: 'verifyPending'; sessionToken: string }
  | { kind: 'authenticated'; session: AuthSession };

/**
 * One field-level validation error from an allauth `errors[]` response. `param`
 * names the offending input (e.g. `"password"`, `"email"`, `"key"`); it is
 * absent for form-wide errors. `code` is a stable machine code; `message` is the
 * backend's human-readable text. See the allauth headless `ErrorResponse` schema.
 */
export interface AllauthFieldError {
  message: string;
  code?: string;
  param?: string;
}

/** A handled auth failure (bad credentials, expired code, …) carrying a message. */
export class AuthError extends Error {
  code?: string;
  /** The full, structured `errors[]` array from a 400 body, for field-level UI. */
  fieldErrors?: AllauthFieldError[];
  constructor(message: string, code?: string, fieldErrors?: AllauthFieldError[]) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

interface AllauthEnvelope {
  status: number;
  data?: {
    user?: AuthUserDto;
    flows?: { id: string; is_pending?: boolean }[];
    /** Refresh tokens come back in data, not meta. */
    access_token?: string;
    refresh_token?: string;
  };
  meta?: {
    is_authenticated?: boolean;
    access_token?: string;
    refresh_token?: string;
    session_token?: string;
  };
  errors?: { message?: string; code?: string; param?: string }[];
}

/**
 * Normalize an allauth response's `errors[]` into typed {@link AllauthFieldError}
 * entries. Fully empty entries (no message and no code) are dropped; everything
 * else is preserved verbatim so the UI can map by `param` and resolve display
 * text (localized code, or the backend message as a fallback).
 */
export function parseAllauthErrors(env: {
  errors?: { message?: string; code?: string; param?: string }[];
}): AllauthFieldError[] {
  return (env.errors ?? [])
    .filter((e) => (e.message ?? '') !== '' || e.code !== undefined)
    .map((e) => ({ message: e.message ?? '', code: e.code, param: e.param }));
}

async function call(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<AllauthEnvelope> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  // allauth mirrors the HTTP status in the body and uses non-2xx for valid
  // pending states (e.g. verification), so always read the JSON body. A
  // non-JSON body (5xx page, HTML, or empty) would otherwise throw a
  // SyntaxError outside the AuthError channel, so map a parse failure to a
  // typed AuthError and keep the failure contract explicit.
  try {
    return (await res.json()) as AllauthEnvelope;
  } catch {
    throw new AuthError('Unexpected response from the server.');
  }
}

function firstError(env: AllauthEnvelope, fallback: string): AuthError {
  const e = env.errors?.[0];
  return new AuthError(e?.message ?? fallback, e?.code, parseAllauthErrors(env));
}

function toSession(env: AllauthEnvelope): AuthSession {
  const user = env.data?.user;
  const at = env.meta?.access_token;
  const rt = env.meta?.refresh_token;
  if (!user || !at || !rt) throw new AuthError('Unexpected auth response.');
  return { user, tokens: { accessToken: at, refreshToken: rt } };
}

export async function signup(input: {
  email: string;
  name: string;
  password: string;
}): Promise<SignupResult> {
  const env = await call('/auth/signup', { method: 'POST', body: JSON.stringify(input) });
  if (env.meta?.is_authenticated && env.data?.user) {
    return { kind: 'authenticated', session: toSession(env) };
  }
  const pending = env.data?.flows?.some((f) => f.id === 'verify_email');
  if (pending && env.meta?.session_token) {
    return { kind: 'verifyPending', sessionToken: env.meta.session_token };
  }
  throw firstError(env, 'Could not create the account.');
}

export async function login(input: { email: string; password: string }): Promise<AuthSession> {
  const env = await call('/auth/login', { method: 'POST', body: JSON.stringify(input) });
  // Stable code so the UI can localize this case; the message is dev-facing.
  // The structured errors[] are carried through for field-level rendering.
  if (!env.meta?.is_authenticated) {
    throw new AuthError(
      env.errors?.[0]?.message ?? 'Invalid email or password.',
      'invalid_credentials',
      parseAllauthErrors(env),
    );
  }
  return toSession(env);
}

export async function verifyEmail(input: {
  code: string;
  sessionToken: string;
}): Promise<AuthSession> {
  const env = await call('/auth/email/verify', {
    method: 'POST',
    headers: { 'X-Session-Token': input.sessionToken },
    body: JSON.stringify({ key: input.code }),
  });
  // Stable code so the UI can localize this case; the message is dev-facing.
  // The structured errors[] are carried through for field-level rendering.
  if (!env.meta?.is_authenticated) {
    throw new AuthError(
      env.errors?.[0]?.message ?? 'That code is invalid or expired.',
      'invalid_code',
      parseAllauthErrors(env),
    );
  }
  return toSession(env);
}

export async function getSession(accessToken: string): Promise<AuthUserDto> {
  const env = await call('/auth/session', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = env.data?.user;
  if (!user) throw new AuthError('Session expired.');
  return user;
}

// Refresh tokens come back in data (confirmed against running backend).
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const env = await call('/tokens/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const at = env.data?.access_token;
  const rt = env.data?.refresh_token;
  if (!at || !rt) throw new AuthError('Could not refresh the session.');
  return { accessToken: at, refreshToken: rt };
}

export async function logout(accessToken: string): Promise<void> {
  await call('/auth/session', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
