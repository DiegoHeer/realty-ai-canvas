# Mobile Auth Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile app's mock authentication with real signup / login / email-verification / logout against the django-allauth headless backend, persisting the JWT and attaching it to `/v1` requests.

**Architecture:** `packages/data` owns the network — a new `auth-client.ts` calling the allauth headless app-client endpoints, and a token-aware upgrade to `request<T>()` (Bearer attach + single-flight 401-refresh-retry) via an injected interceptor config so the package stays native-free. `apps/mobile` owns UI + persistence — a SecureStore token wrapper, a refactored `use-auth` store (async, real, wires the interceptor), and the login/register/verify screens. A single `EXPO_PUBLIC_AUTH_ENABLED` flag selects real vs the existing mock path (mock stays the default + the visual-regression path).

**Tech Stack:** Expo ~56 (React Native), TypeScript, React Query (`@tanstack/react-query`), `expo-secure-store` (new), Jest + `@testing-library/react-native`, `@realty/i18n`.

## Global Constraints

- Package manager: **`bun` / `bunx`** only — never `npm`/`npx`.
- Expo SDK **~56.0.11** — read https://docs.expo.dev/versions/v56.0.0/ before writing native-touching code (`expo-secure-store`).
- All user-visible text goes through **i18n** (`packages/i18n`), EN + PT, except data fields.
- Persistent storage is **AsyncStorage** via `apps/mobile/src/lib/storage.ts`, **except** JWT tokens, which use **SecureStore** (the one sanctioned exception; document it in `apps/mobile/CLAUDE.md`'s upstream `CLAUDE.md` Storage section). All reads/writes best-effort (resolve to a safe default, never throw).
- Test runner: **Jest via jest-expo**. Component tests use **RNTL v14**. Visual regression must stay deterministic via the mock path.
- **Test commands — important:** `bun test` runs **bun's native runner** (no `jest.*` globals — it throws `jest.resetModules is not a function`). Do NOT use it. To run a single file, `cd` into the package and use jest directly: `cd packages/data && bunx jest src/__tests__/<file>.test.ts` (or `cd apps/mobile && bunx jest src/__tests__/<file>`). Whole package: `cd <package> && bunx jest`. Whole repo: `bun run test` (root script fans out `jest` per package). Wherever a task step below says `bun test <path>`, read it as `cd <that package> && bunx jest <package-relative path>`.
- Tests define expected behavior — fix source to match correct behavior, never weaken tests.
- Conventional Commits, atomic commits; codebase stays working after each task.
- Backend contract (verified, PR #189): base `/_allauth/app/v1`; tokens in `meta.access_token`/`meta.refresh_token`; user in `data.user` (display its **`name`**). `signup` → HTTP 401 + `data.flows[].id == "verify_email"` pending + `meta.session_token` (no tokens until verified). `login` → 200 + user + tokens. `verifyEmail` + `refresh` paths are **to-confirm** (Task 1) — coded against allauth-65.18 docs and marked `CONTRACT TO CONFIRM`.

---

## Suggested PR grouping (≈600 LOC each, source/tests counted separately)

- **PR 1 — Network foundation:** Tasks 1–5 (flag, auth-client, token-aware request, refresh interceptor). No UI behavior change.
- **PR 2 — Store + secure persistence:** Tasks 6–7 (SecureStore wrapper, real `use-auth` store). App still behaves as mock unless the flag is on.
- **PR 3 — Screens + verify flow:** Tasks 8–11 (login, register→verify, verify screen, social gating + i18n).

---

## File Structure

**`packages/data`**
- Modify `src/env.ts` — add `AUTH_ENABLED` flag.
- Create `src/auth-client.ts` — typed allauth headless calls + DTOs + `AuthError`.
- Modify `src/client.ts` — `configureAuthInterceptor()`, Bearer attach, 401 refresh-retry.
- Modify `src/index.ts` — re-export the new public surface (check exact export style first).
- Create `src/__tests__/auth-client.test.ts`, `src/__tests__/auth-interceptor.test.ts`.

**`apps/mobile`**
- Create `src/lib/secure-tokens.ts` — SecureStore wrapper.
- Modify `src/hooks/use-auth.ts` — real async store, hydration, interceptor wiring, single-flight refresh.
- Modify `src/app/auth/login.tsx`, `src/app/auth/register.tsx` — async submit, server errors, verify nav.
- Create `src/app/auth/verify.tsx` — verify-by-code screen.
- Modify `src/app/_layout.tsx` — register the `auth/verify` route.
- Modify `src/components/auth-ui.tsx` — gate social buttons; add a code field if needed.
- Modify `packages/i18n/src/locales/en.json`, `pt.json` — verify + error keys.
- Modify/extend tests under `src/__tests__/` and `src/__tests__/screens/`.

---

### Task 1: Confirm the live verify-email + refresh contract (spike)

**Why:** signup/login/session are verified; the verify-email and token-refresh request/response shapes are not. This task records them so Tasks 3 & 5 build against reality. If the backend can't be brought up quickly, proceed with the documented shapes already encoded in this plan and revisit.

**Files:**
- Modify: `docs/superpowers/specs/2026-06-29-auth-registration-design.md` (appendix — replace the two "to confirm" bullets with verified shapes).

- [ ] **Step 1: Bring up the merged backend locally**

```bash
cd /home/diego/projects/realty-alerts/services/api
# A stale sqlite db can break migrate ("no such table: dead_listings").
# Use a fresh DB for the capture:
rm -f db.sqlite3
uv run python manage.py migrate
uv run python manage.py runserver 0.0.0.0:8000
```

- [ ] **Step 2: Capture signup → verify (code printed to the console email backend)**

```bash
# Signup — note meta.session_token in the response and the code in the runserver console.
curl -i -X POST http://localhost:8000/_allauth/app/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada Lovelace","password":"sup3rs3cret!"}'

# Verify — confirm the exact path, the body field name (key vs code), and the
# header that carries the session token (X-Session-Token vs Authorization).
curl -i -X POST http://localhost:8000/_allauth/app/v1/auth/email/verify \
  -H 'Content-Type: application/json' \
  -H 'X-Session-Token: <session_token-from-signup>' \
  -d '{"key":"<code-from-console>"}'
```

- [ ] **Step 3: Capture login → refresh**

```bash
# Login (after verifying) — capture meta.access_token / meta.refresh_token.
curl -i -X POST http://localhost:8000/_allauth/app/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"sup3rs3cret!"}'

# Refresh — confirm the path and body field (refresh_token) and the response shape.
curl -i -X POST http://localhost:8000/_allauth/app/v1/auth/token/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"<refresh_token-from-login>"}'
```

- [ ] **Step 4: Record the verified shapes in the spec appendix and commit**

If any path/field differs from this plan's `auth-client.ts`, note it; Task 3 will use the verified values.

```bash
cd /home/diego/projects/realty-ai-canvas
git add docs/superpowers/specs/2026-06-29-auth-registration-design.md
git commit -m "docs: record verified allauth verify-email and refresh contract"
```

---

### Task 2: Feature flag `AUTH_ENABLED`

**Files:**
- Modify: `packages/data/src/env.ts`
- Test: `packages/data/src/__tests__/env-auth-flag.test.ts`

**Interfaces:**
- Produces: `AUTH_ENABLED: boolean` exported from `@realty/data` env.

- [ ] **Step 1: Write the failing test**

```ts
// packages/data/src/__tests__/env-auth-flag.test.ts
describe('AUTH_ENABLED', () => {
  const original = process.env.EXPO_PUBLIC_AUTH_ENABLED;
  afterEach(() => {
    process.env.EXPO_PUBLIC_AUTH_ENABLED = original;
    jest.resetModules();
  });

  it('is true only when the env var is exactly "true"', () => {
    process.env.EXPO_PUBLIC_AUTH_ENABLED = 'true';
    jest.resetModules();
    expect(require('../env').AUTH_ENABLED).toBe(true);
  });

  it('is false when unset', () => {
    delete process.env.EXPO_PUBLIC_AUTH_ENABLED;
    jest.resetModules();
    expect(require('../env').AUTH_ENABLED).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/data/src/__tests__/env-auth-flag.test.ts`
Expected: FAIL — `AUTH_ENABLED` is undefined.

- [ ] **Step 3: Add the flag**

Append to `packages/data/src/env.ts`:

```ts
/**
 * Turn on real backend authentication (allauth headless JWT). Off by default,
 * so the app keeps the mock auth path — which is also the deterministic
 * visual-regression path. Set EXPO_PUBLIC_AUTH_ENABLED=true to use the real
 * signup/login/verify flow and attach Bearer tokens to /v1 requests.
 */
export const AUTH_ENABLED = process.env.EXPO_PUBLIC_AUTH_ENABLED === 'true';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/data/src/__tests__/env-auth-flag.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/env.ts packages/data/src/__tests__/env-auth-flag.test.ts
git commit -m "feat(data): add AUTH_ENABLED feature flag"
```

---

### Task 3: `auth-client.ts` — typed allauth headless calls

**Files:**
- Create: `packages/data/src/auth-client.ts`
- Modify: `packages/data/src/index.ts` (export the public surface — match the file's existing export style)
- Test: `packages/data/src/__tests__/auth-client.test.ts`

**Interfaces:**
- Consumes: `API_BASE` from `./env`.
- Produces:
  - `interface AuthUserDto { id: number; email: string; name: string; display?: string; username?: string }`
  - `interface AuthTokens { accessToken: string; refreshToken: string }`
  - `interface AuthSession { user: AuthUserDto; tokens: AuthTokens }`
  - `type SignupResult = { kind: 'verifyPending'; sessionToken: string } | { kind: 'authenticated'; session: AuthSession }`
  - `class AuthError extends Error { code?: string }`
  - `signup(i: { email: string; name: string; password: string }): Promise<SignupResult>`
  - `login(i: { email: string; password: string }): Promise<AuthSession>`
  - `verifyEmail(i: { code: string; sessionToken: string }): Promise<AuthSession>`
  - `getSession(accessToken: string): Promise<AuthUserDto>`
  - `refresh(refreshToken: string): Promise<AuthTokens>`
  - `logout(accessToken: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/data/src/__tests__/auth-client.test.ts
import { AuthError, login, signup, verifyEmail } from '../auth-client';

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('auth-client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('login returns the user (with name) and tokens from meta', async () => {
    mockFetch(200, {
      status: 200,
      data: { user: { id: 1, email: 'ada@example.com', name: 'Ada Lovelace', display: 'ada', username: 'ada' } },
      meta: { is_authenticated: true, access_token: 'AT', refresh_token: 'RT' },
    });
    const session = await login({ email: 'ada@example.com', password: 'pw' });
    expect(session.user.name).toBe('Ada Lovelace');
    expect(session.tokens).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
  });

  it('signup returns verifyPending with the session token on a 401 verify_email flow', async () => {
    mockFetch(401, {
      status: 401,
      data: { flows: [{ id: 'login' }, { id: 'verify_email', is_pending: true }] },
      meta: { is_authenticated: false, session_token: 'ST' },
    });
    const result = await signup({ email: 'ada@example.com', name: 'Ada', password: 'pw' });
    expect(result).toEqual({ kind: 'verifyPending', sessionToken: 'ST' });
  });

  it('login throws AuthError on invalid credentials (400/401 without verify flow)', async () => {
    mockFetch(400, { status: 400, errors: [{ message: 'Invalid credentials.' }] });
    await expect(login({ email: 'x@y.z', password: 'bad' })).rejects.toBeInstanceOf(AuthError);
  });

  it('verifyEmail sends the code + session token and returns an authenticated session', async () => {
    mockFetch(200, {
      status: 200,
      data: { user: { id: 1, email: 'ada@example.com', name: 'Ada Lovelace' } },
      meta: { is_authenticated: true, access_token: 'AT2', refresh_token: 'RT2' },
    });
    const session = await verifyEmail({ code: '123456', sessionToken: 'ST' });
    expect(session.tokens.accessToken).toBe('AT2');
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[1].headers['X-Session-Token']).toBe('ST');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/data/src/__tests__/auth-client.test.ts`
Expected: FAIL — `../auth-client` not found.

- [ ] **Step 3: Implement `auth-client.ts`**

```ts
// packages/data/src/auth-client.ts
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

/** A handled auth failure (bad credentials, expired code, …) carrying a message. */
export class AuthError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

interface AllauthEnvelope {
  status: number;
  data?: {
    user?: AuthUserDto;
    flows?: { id: string; is_pending?: boolean }[];
  };
  meta?: {
    is_authenticated?: boolean;
    access_token?: string;
    refresh_token?: string;
    session_token?: string;
  };
  errors?: { message?: string; code?: string }[];
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
  // pending states (e.g. verification), so always read the JSON body.
  return (await res.json()) as AllauthEnvelope;
}

function firstError(env: AllauthEnvelope, fallback: string): AuthError {
  const e = env.errors?.[0];
  return new AuthError(e?.message ?? fallback, e?.code);
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
  if (!env.meta?.is_authenticated) throw firstError(env, 'Invalid email or password.');
  return toSession(env);
}

// CONTRACT TO CONFIRM (Task 1): path `/auth/email/verify`, body field `key`,
// session carried via the `X-Session-Token` header.
export async function verifyEmail(input: {
  code: string;
  sessionToken: string;
}): Promise<AuthSession> {
  const env = await call('/auth/email/verify', {
    method: 'POST',
    headers: { 'X-Session-Token': input.sessionToken },
    body: JSON.stringify({ key: input.code }),
  });
  if (!env.meta?.is_authenticated) throw firstError(env, 'That code is invalid or expired.');
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

// CONTRACT TO CONFIRM (Task 1): path `/auth/token/refresh`, body `refresh_token`.
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const env = await call('/auth/token/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const at = env.meta?.access_token;
  const rt = env.meta?.refresh_token;
  if (!at || !rt) throw new AuthError('Could not refresh the session.');
  return { accessToken: at, refreshToken: rt };
}

export async function logout(accessToken: string): Promise<void> {
  await call('/auth/session', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
```

- [ ] **Step 4: Export from the package index**

Open `packages/data/src/index.ts`, match its existing re-export style, and add the auth-client surface, e.g.:

```ts
export * from './auth-client';
```

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test packages/data/src/__tests__/auth-client.test.ts && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/auth-client.ts packages/data/src/index.ts packages/data/src/__tests__/auth-client.test.ts
git commit -m "feat(data): add allauth headless auth client"
```

---

### Task 4: Token-aware `request()` — Bearer attach via injected interceptor

**Files:**
- Modify: `packages/data/src/client.ts`
- Modify: `packages/data/src/index.ts` (export `configureAuthInterceptor`, `AuthInterceptorConfig`)
- Test: `packages/data/src/__tests__/auth-interceptor.test.ts`

**Interfaces:**
- Produces:
  - `interface AuthInterceptorConfig { getAccessToken: () => string | null; refresh: () => Promise<string | null> }`
  - `function configureAuthInterceptor(config: AuthInterceptorConfig | null): void`
- Consumed by: Task 7 (`use-auth` calls `configureAuthInterceptor`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/data/src/__tests__/auth-interceptor.test.ts
import { configureAuthInterceptor } from '../client';
import { getListings } from '../client';

// USE_LISTING_MOCKS is true only when API_URL === ''. Force a real fetch path.
jest.mock('../env', () => ({
  ...jest.requireActual('../env'),
  API_BASE: 'https://api.test',
  API_URL: 'https://api.test',
  USE_LISTING_MOCKS: false,
  USE_MOCKS: false,
}));

function okJson(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}

describe('request() Bearer injection', () => {
  afterEach(() => {
    configureAuthInterceptor(null);
    jest.restoreAllMocks();
  });

  it('attaches Authorization when a token is available', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson([]));
    global.fetch = fetchMock as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'AT', refresh: async () => null });

    await getListings();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer AT');
  });

  it('omits Authorization when no interceptor is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await getListings();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/data/src/__tests__/auth-interceptor.test.ts`
Expected: FAIL — `configureAuthInterceptor` is not exported.

- [ ] **Step 3: Add the interceptor config + Bearer attach in `client.ts`**

Add near the top of `packages/data/src/client.ts` (after imports):

```ts
/**
 * Auth hook for `request()`. The app (which owns token storage) registers a
 * config at boot via `configureAuthInterceptor`; the data package stays free of
 * native storage deps. `getAccessToken` is read synchronously per request;
 * `refresh` is awaited once on a 401 (see Task 5).
 */
export interface AuthInterceptorConfig {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
}

let authInterceptor: AuthInterceptorConfig | null = null;

export function configureAuthInterceptor(config: AuthInterceptorConfig | null): void {
  authInterceptor = config;
}
```

Replace the body of `request<T>()` with the token-aware version:

```ts
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authInterceptor?.getAccessToken() ?? null;
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeader, ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Export from the index**

Add to `packages/data/src/index.ts` (or confirm `export * from './client'` already covers it):

```ts
export { configureAuthInterceptor, type AuthInterceptorConfig } from './client';
```

- [ ] **Step 5: Run test + full data suite**

Run: `bun test packages/data && bun run typecheck`
Expected: PASS — existing client tests unaffected (no token → no header).

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/client.ts packages/data/src/index.ts packages/data/src/__tests__/auth-interceptor.test.ts
git commit -m "feat(data): attach Bearer token to API requests via interceptor"
```

---

### Task 5: 401 → single-flight refresh → retry once

**Files:**
- Modify: `packages/data/src/client.ts`
- Test: `packages/data/src/__tests__/auth-interceptor.test.ts` (extend)

**Interfaces:**
- Consumes: `AuthInterceptorConfig.refresh` from Task 4.

- [ ] **Step 1: Write the failing tests (append to the interceptor test file)**

```ts
describe('request() 401 refresh-retry', () => {
  afterEach(() => {
    configureAuthInterceptor(null);
    jest.restoreAllMocks();
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) })
      .mockResolvedValueOnce(okJson([]));
    global.fetch = fetchMock as unknown as typeof fetch;
    const refresh = jest.fn().mockResolvedValue('NEW');
    configureAuthInterceptor({ getAccessToken: () => 'OLD', refresh });

    await getListings();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer NEW');
  });

  it('coalesces concurrent 401s into a single refresh (single-flight)', async () => {
    const fetchMock = jest.fn().mockImplementation((_url, opts) => {
      const auth = (opts.headers as Record<string, string>).Authorization;
      return Promise.resolve(
        auth === 'Bearer NEW'
          ? okJson([])
          : { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) },
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    let current = 'OLD';
    const refresh = jest.fn().mockImplementation(async () => {
      current = 'NEW';
      return current;
    });
    configureAuthInterceptor({ getAccessToken: () => current, refresh });

    await Promise.all([getListings(), getListings()]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('throws when refresh fails (returns null)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) }) as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'OLD', refresh: async () => null });

    await expect(getListings()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test packages/data/src/__tests__/auth-interceptor.test.ts`
Expected: FAIL — no retry happens; first call rejects on 401.

- [ ] **Step 3: Implement single-flight refresh + retry in `client.ts`**

Add a module-level single-flight helper near the interceptor config:

```ts
let refreshInFlight: Promise<string | null> | null = null;

/** Coalesce concurrent refreshes into one network call. */
function refreshOnce(): Promise<string | null> {
  if (!authInterceptor) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = authInterceptor.refresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
```

Replace `request<T>()` with the retry-aware version:

```ts
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const send = (token: string | null) => {
    const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...authHeader, ...init?.headers },
    });
  };

  let res = await send(authInterceptor?.getAccessToken() ?? null);

  if (res.status === 401 && authInterceptor) {
    const newToken = await refreshOnce();
    if (!newToken) {
      throw new Error(`Request to ${path} failed: 401 (refresh failed)`);
    }
    res = await send(newToken);
  }

  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Run tests + full suite**

Run: `bun test packages/data && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/client.ts packages/data/src/__tests__/auth-interceptor.test.ts
git commit -m "feat(data): refresh JWT once and retry on 401"
```

---

### Task 6: SecureStore token wrapper

**Files:**
- Create: `apps/mobile/src/lib/secure-tokens.ts`
- Modify: `apps/mobile/package.json` (add `expo-secure-store`)
- Modify: `apps/mobile/test-setup.ts` (mock `expo-secure-store`)
- Test: `apps/mobile/src/__tests__/secure-tokens.test.ts`

**Interfaces:**
- Produces:
  - `interface StoredTokens { accessToken: string; refreshToken: string }`
  - `loadTokens(): Promise<StoredTokens | null>`
  - `saveTokens(t: StoredTokens): Promise<void>`
  - `clearTokens(): Promise<void>`

- [ ] **Step 1: Add the dependency**

Run (matches the Expo SDK; verify the version against the v56 docs):

```bash
cd apps/mobile && bunx expo install expo-secure-store
```

- [ ] **Step 2: Mock it in test-setup**

Add to `apps/mobile/test-setup.ts` (in-memory store so tests are deterministic):

```ts
// --- expo-secure-store mock (in-memory) ---
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
```

- [ ] **Step 3: Write the failing test**

```ts
// apps/mobile/src/__tests__/secure-tokens.test.ts
import { clearTokens, loadTokens, saveTokens } from '@/lib/secure-tokens';

describe('secure-tokens', () => {
  afterEach(async () => {
    await clearTokens();
  });

  it('round-trips tokens', async () => {
    await saveTokens({ accessToken: 'AT', refreshToken: 'RT' });
    expect(await loadTokens()).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
  });

  it('returns null after clear', async () => {
    await saveTokens({ accessToken: 'AT', refreshToken: 'RT' });
    await clearTokens();
    expect(await loadTokens()).toBeNull();
  });

  it('returns null (never throws) on malformed storage', async () => {
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync('realty.tokens', 'not-json');
    expect(await loadTokens()).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `bun test apps/mobile/src/__tests__/secure-tokens.test.ts`
Expected: FAIL — `@/lib/secure-tokens` not found.

- [ ] **Step 5: Implement the wrapper**

```ts
// apps/mobile/src/lib/secure-tokens.ts
import * as SecureStore from 'expo-secure-store';

/**
 * JWT access + refresh tokens, persisted in the device keychain/keystore via
 * expo-secure-store. This is the sanctioned exception to the AsyncStorage-only
 * storage rule: tokens are sensitive credentials. Like `lib/storage`, every
 * operation is best-effort and resolves to a safe default instead of throwing.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

// SecureStore keys must be alphanumeric + ".-_"; the `realty:` colon prefix
// used by AsyncStorage isn't valid here, so use a dot.
const TOKENS_KEY = 'realty.tokens';

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKENS_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTokens>;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // Best-effort.
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKENS_KEY);
  } catch {
    // Best-effort.
  }
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `bun test apps/mobile/src/__tests__/secure-tokens.test.ts && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Document the storage exception + commit**

Add one line to the root `CLAUDE.md` Storage section noting tokens use SecureStore (`apps/mobile/src/lib/secure-tokens.ts`) as the sole exception.

```bash
git add apps/mobile/src/lib/secure-tokens.ts apps/mobile/test-setup.ts apps/mobile/package.json bun.lock CLAUDE.md apps/mobile/src/__tests__/secure-tokens.test.ts
git commit -m "feat(mobile): add SecureStore JWT token wrapper"
```

---

### Task 7: Refactor `use-auth` to real backend auth

**Files:**
- Modify: `apps/mobile/src/hooks/use-auth.ts`
- Modify: `apps/mobile/src/__tests__/use-auth.test.ts`

**Interfaces:**
- Consumes: `auth-client` (`signup`, `login`, `verifyEmail`, `getSession`, `refresh`, `logout`, DTOs, `AuthError`), `configureAuthInterceptor`, `AUTH_ENABLED` from `@realty/data`; `secure-tokens` (`loadTokens`/`saveTokens`/`clearTokens`); `queryClient` from `@realty/data`.
- Produces (the `useAuth()` return, consumed by screens + profile):
  - `user: AuthUser | null`, `isAuthenticated: boolean`
  - `type AuthOutcome = { ok: true } | { ok: false; error: string } | { ok: 'verifyPending' }`
  - `signInWithEmail(email: string, password: string): Promise<AuthOutcome>`
  - `registerWithEmail(p: { name: string; email: string; password: string }): Promise<AuthOutcome>`
  - `verifyEmail(code: string): Promise<AuthOutcome>`
  - `signOut(): Promise<void>`
  - Retained for mock mode only: `signIn()` (demo), `signInWithGoogle()`, `signInWithApple()`.

**Design notes for the implementer:**
- `AUTH_ENABLED === false` → keep the existing mock helper bodies verbatim (this is the visual-regression path). `AUTH_ENABLED === true` → call the real `auth-client`.
- Real mode owns three pieces of state: `currentUser`, in-memory `accessToken`/`refreshToken`, and a pending `sessionToken` (from signup, consumed by `verifyEmail`).
- At first import in real mode: `configureAuthInterceptor({ getAccessToken, refresh })` and hydrate tokens from SecureStore + user via `getSession`.
- `refresh` (passed to the interceptor) calls `authRefresh(refreshToken)`, persists the rotated tokens, returns the new access token, and on failure clears the session and returns `null`.
- `signOut()` calls `logout(accessToken)` (best-effort), clears SecureStore + the `realty:session` key, clears in-memory state, and `queryClient.clear()` to drop cached `/v1` data.
- Map `AuthUserDto` → `AuthUser` with `{ name: dto.name, email: dto.email }`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/__tests__/use-auth.test.ts  (real-mode additions)
// NOTE: AUTH_ENABLED is read at module load. Set the env BEFORE importing the
// store, and jest.resetModules() between mode switches.
import { clearTokens, loadTokens } from '@/lib/secure-tokens';
import * as authClient from '@realty/data';

jest.mock('@realty/data', () => {
  const actual = jest.requireActual('@realty/data');
  return { ...actual, AUTH_ENABLED: true };
});

describe('use-auth (real mode)', () => {
  afterEach(async () => {
    await clearTokens();
    jest.restoreAllMocks();
  });

  it('login persists tokens and exposes the user name', async () => {
    jest.spyOn(authClient, 'login').mockResolvedValue({
      user: { id: 1, email: 'ada@example.com', name: 'Ada Lovelace' },
      tokens: { accessToken: 'AT', refreshToken: 'RT' },
    });
    const { signInWithEmail, getCurrentUser } = require('@/hooks/use-auth');

    const outcome = await signInWithEmail('ada@example.com', 'pw');

    expect(outcome).toEqual({ ok: true });
    expect(getCurrentUser()).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(await loadTokens()).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
  });

  it('register returns verifyPending and does not establish a session', async () => {
    jest.spyOn(authClient, 'signup').mockResolvedValue({ kind: 'verifyPending', sessionToken: 'ST' });
    const { registerWithEmail, getCurrentUser } = require('@/hooks/use-auth');

    const outcome = await registerWithEmail({ name: 'Ada', email: 'ada@example.com', password: 'pw' });

    expect(outcome).toEqual({ ok: 'verifyPending' });
    expect(getCurrentUser()).toBeNull();
  });

  it('login surfaces a friendly error on AuthError', async () => {
    jest.spyOn(authClient, 'login').mockRejectedValue(new authClient.AuthError('Invalid email or password.'));
    const { signInWithEmail } = require('@/hooks/use-auth');

    const outcome = await signInWithEmail('x@y.z', 'bad');

    expect(outcome).toEqual({ ok: false, error: 'Invalid email or password.' });
  });
});
```

> Implementer note: add a tiny `getCurrentUser()` test helper export (returns the in-memory `currentUser`) so tests assert state without rendering. Keep the existing mock-mode tests; wrap them in their own module-state reset.

- [ ] **Step 2: Run to verify failure**

Run: `bun test apps/mobile/src/__tests__/use-auth.test.ts`
Expected: FAIL — async outcomes/`getCurrentUser` not implemented.

- [ ] **Step 3: Implement the real store**

Rewrite `apps/mobile/src/hooks/use-auth.ts`. Keep the `useSyncExternalStore` skeleton (`currentUser`, `listeners`, `emit`, `subscribe`, `getSnapshot`) and the mock helpers, gated by `AUTH_ENABLED`. Add real-mode logic:

```ts
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

export interface AuthUser {
  name: string;
  email: string;
  avatarUrl?: string;
}

export type AuthOutcome = { ok: true } | { ok: false; error: string } | { ok: 'verifyPending' };

let currentUser: AuthUser | null = null;
let accessToken: string | null = null;
let refreshToken: string | null = null;
let pendingSessionToken: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function toAuthUser(dto: AuthUserDto): AuthUser {
  return { name: dto.name, email: dto.email };
}

/** Apply a signed-in session: user + tokens, persisted to disk + keychain. */
async function applySession(user: AuthUser, tokens: { accessToken: string; refreshToken: string }) {
  currentUser = user;
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  pendingSessionToken = null;
  await saveTokens(tokens);
  await saveJSON(StorageKeys.session, user);
  emit();
}

function messageFor(error: unknown): string {
  return error instanceof AuthError ? error.message : 'Something went wrong. Please try again.';
}

// --- real-mode helpers -------------------------------------------------------

async function realSignIn(email: string, password: string): Promise<AuthOutcome> {
  try {
    const session = await authLogin({ email: email.trim(), password });
    await applySession(toAuthUser(session.user), session.tokens);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

async function realRegister(p: { name: string; email: string; password: string }): Promise<AuthOutcome> {
  try {
    const result = await authSignup({ name: p.name.trim(), email: p.email.trim(), password: p.password });
    if (result.kind === 'authenticated') {
      await applySession(toAuthUser(result.session.user), result.session.tokens);
      return { ok: true };
    }
    pendingSessionToken = result.sessionToken;
    return { ok: 'verifyPending' };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

async function realVerify(code: string): Promise<AuthOutcome> {
  if (!pendingSessionToken) return { ok: false, error: 'Please register again.' };
  try {
    const session = await authVerifyEmail({ code: code.trim(), sessionToken: pendingSessionToken });
    await applySession(toAuthUser(session.user), session.tokens);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
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
    try {
      await authLogout(token);
    } catch {
      // Best-effort server-side logout.
    }
  }
}

let hydrated = false;

async function realHydrate() {
  if (hydrated) return;
  hydrated = true;
  configureAuthInterceptor({ getAccessToken: () => accessToken, refresh: realRefresh });
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
    const dto = await authGetSession(tokens.accessToken); // refreshes via interceptor on 401
    currentUser = toAuthUser(dto);
    await saveJSON(StorageKeys.session, currentUser);
    emit();
  } catch {
    // Interceptor already tore down the session if refresh failed.
  }
}
```

Then keep the **mock-mode** helpers (the current `signInWithEmail`/`registerWithEmail`/`signInWithGoogle`/`signInWithApple`/`signIn`/`signOut`/`hydrateAuth`/`nameFromEmail`/`setSession`) and branch the exported API on `AUTH_ENABLED`:

```ts
// Mock-mode helpers (unchanged behavior) live here, renamed to mock* to avoid
// clashing with the real* helpers above, e.g. mockSignInWithEmail, etc.

export function getCurrentUser(): AuthUser | null {
  return currentUser;
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
  if (AUTH_ENABLED) {
    return {
      user,
      isAuthenticated: user !== null,
      signInWithEmail: realSignIn,
      registerWithEmail: realRegister,
      verifyEmail: realVerify,
      signOut: realSignOut,
    };
  }
  return {
    user,
    isAuthenticated: user !== null,
    signInWithEmail: (email: string, _password?: string): Promise<AuthOutcome> => {
      mockSignInWithEmail(email);
      return Promise.resolve({ ok: true });
    },
    registerWithEmail: (p: { name: string; email: string; password?: string }): Promise<AuthOutcome> => {
      mockRegisterWithEmail({ name: p.name, email: p.email });
      return Promise.resolve({ ok: true });
    },
    verifyEmail: (_code: string): Promise<AuthOutcome> => Promise.resolve({ ok: true }),
    signOut: (): Promise<void> => {
      mockSignOut();
      return Promise.resolve();
    },
    signIn: mockSignIn,
    signInWithGoogle: mockSignInWithGoogle,
    signInWithApple: mockSignInWithApple,
  };
}

// Boot hydration: real or mock.
void (AUTH_ENABLED ? realHydrate() : mockHydrateAuth());
```

> Confirm `queryClient` is exported from `@realty/data` (it is — `packages/data/src/provider.tsx` exports it; ensure it's re-exported from the package index).

- [ ] **Step 4: Run tests + typecheck**

Run: `bun test apps/mobile/src/__tests__/use-auth.test.ts && bun run typecheck`
Expected: PASS (both mock and real-mode tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-auth.ts apps/mobile/src/__tests__/use-auth.test.ts packages/data/src/index.ts
git commit -m "feat(mobile): wire use-auth store to real backend auth behind flag"
```

---

### Task 8: Login screen — async submit + server errors

**Files:**
- Modify: `apps/mobile/src/app/auth/login.tsx`
- Modify: `apps/mobile/src/__tests__/screens/login.test.tsx`
- Modify: `packages/i18n/src/locales/en.json`, `pt.json` (add `auth.errorGeneric`)

**Interfaces:**
- Consumes: `useAuth().signInWithEmail(email, password): Promise<AuthOutcome>`.

- [ ] **Step 1: Add the i18n error key**

In both locale files' `auth` block add:

```jsonc
// en.json
"errorGeneric": "Something went wrong. Please try again.",
"submitting": "Please wait…"
```
```jsonc
// pt.json
"errorGeneric": "Algo correu mal. Tente novamente.",
"submitting": "Aguarde…"
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/mobile/src/__tests__/screens/login.test.tsx (add)
it('shows a server error when sign-in fails', async () => {
  const { signInWithEmail } = require('@/hooks/use-auth');
  jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
    signInWithEmail: jest.fn().mockResolvedValue({ ok: false, error: 'Invalid email or password.' }),
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  });
  const { getByLabelText, getByTestId, findByText } = render(<LoginScreen />);
  fireEvent.changeText(getByLabelText('Email'), 'ada@example.com');
  fireEvent.changeText(getByLabelText('Password'), 'bad');
  fireEvent.press(getByTestId('auth-submit'));
  expect(await findByText('Invalid email or password.')).toBeOnTheScreen();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `bun test apps/mobile/src/__tests__/screens/login.test.tsx`
Expected: FAIL — no server-error text rendered.

- [ ] **Step 4: Make `submit` async + render the form error**

Update `login.tsx`: add `const [formError, setFormError] = useState<string>()` and a `submitting` flag; change `submit` to await the outcome:

```tsx
async function submit() {
  const next: { email?: string; password?: string } = {};
  if (!email.trim()) next.email = t('auth.errorEmailRequired');
  else if (!isValidEmail(email)) next.email = t('auth.errorEmailInvalid');
  if (!password) next.password = t('auth.errorPasswordRequired');
  setErrors(next);
  setFormError(undefined);
  if (next.email || next.password) return;

  setSubmitting(true);
  const outcome = await signInWithEmail(email, password);
  setSubmitting(false);
  if (outcome.ok === true) {
    requestAnimationFrame(() => router.back());
  } else if (outcome.ok === false) {
    setFormError(outcome.error);
  }
}
```

Render `{formError ? <Text className="text-sm text-red-600 dark:text-red-400">{formError}</Text> : null}` above `PrimaryButton`. (Drop the old synchronous `completeAndDismiss(signInWithEmail(...))` call.)

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test apps/mobile/src/__tests__/screens/login.test.tsx && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/auth/login.tsx apps/mobile/src/__tests__/screens/login.test.tsx packages/i18n/src/locales/en.json packages/i18n/src/locales/pt.json
git commit -m "feat(mobile): wire login screen to async auth with server errors"
```

---

### Task 9: Register screen — async submit + navigate to verify

**Files:**
- Modify: `apps/mobile/src/app/auth/register.tsx`
- Modify: `apps/mobile/src/__tests__/screens/register.test.tsx`

**Interfaces:**
- Consumes: `useAuth().registerWithEmail({ name, email, password }): Promise<AuthOutcome>`; `router.push('/auth/verify')`.

- [ ] **Step 1: Write the failing test**

```tsx
// register.test.tsx (add)
it('navigates to verify when registration is pending', async () => {
  jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
    registerWithEmail: jest.fn().mockResolvedValue({ ok: 'verifyPending' }),
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
  });
  const { mockPush } = require('../../../test-setup');
  const { getByLabelText, getByTestId } = render(<RegisterScreen />);
  fireEvent.changeText(getByLabelText('Name'), 'Ada Lovelace');
  fireEvent.changeText(getByLabelText('Email'), 'ada@example.com');
  fireEvent.changeText(getByLabelText('Password'), 'sup3rs3cret!');
  fireEvent.press(getByTestId('auth-submit'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/verify'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test apps/mobile/src/__tests__/screens/register.test.tsx`
Expected: FAIL — no navigation to verify.

- [ ] **Step 3: Make `submit` async with the three outcomes**

In `register.tsx`, pass `password` through and branch on the outcome:

```tsx
async function submit() {
  const next: { name?: string; email?: string; password?: string } = {};
  if (!name.trim()) next.name = t('auth.errorNameRequired');
  if (!email.trim()) next.email = t('auth.errorEmailRequired');
  else if (!isValidEmail(email)) next.email = t('auth.errorEmailInvalid');
  if (!password) next.password = t('auth.errorPasswordRequired');
  else if (password.length < MIN_PASSWORD_LENGTH) next.password = t('auth.errorPasswordTooShort');
  setErrors(next);
  setFormError(undefined);
  if (next.name || next.email || next.password) return;

  setSubmitting(true);
  const outcome = await registerWithEmail({ name, email, password });
  setSubmitting(false);
  if (outcome.ok === 'verifyPending') router.push('/auth/verify');
  else if (outcome.ok === true) requestAnimationFrame(() => router.back());
  else setFormError(outcome.error);
}
```

Add the same `formError`/`submitting` state + error `<Text>` as the login screen.

- [ ] **Step 4: Run tests + typecheck**

Run: `bun test apps/mobile/src/__tests__/screens/register.test.tsx && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/auth/register.tsx apps/mobile/src/__tests__/screens/register.test.tsx
git commit -m "feat(mobile): wire register screen to async auth and verify step"
```

---

### Task 10: Verify-email screen + route

**Files:**
- Create: `apps/mobile/src/app/auth/verify.tsx`
- Modify: `apps/mobile/src/app/_layout.tsx` (register the route)
- Modify: `packages/i18n/src/locales/en.json`, `pt.json` (verify keys)
- Test: `apps/mobile/src/__tests__/screens/verify.test.tsx`

**Interfaces:**
- Consumes: `useAuth().verifyEmail(code): Promise<AuthOutcome>`.

- [ ] **Step 1: Add i18n keys (both locales' `auth` block)**

```jsonc
// en.json
"verifyTitle": "Verify your email",
"verifySubtitle": "Enter the code we emailed you to finish creating your account.",
"verifyCode": "Verification code",
"verifyCodePlaceholder": "6-digit code",
"verifyCta": "Verify",
"errorCodeRequired": "Please enter the code."
```
```jsonc
// pt.json
"verifyTitle": "Verifique o seu e-mail",
"verifySubtitle": "Introduza o código que lhe enviámos para concluir a criação da conta.",
"verifyCode": "Código de verificação",
"verifyCodePlaceholder": "Código de 6 dígitos",
"verifyCta": "Verificar",
"errorCodeRequired": "Introduza o código."
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/mobile/src/__tests__/screens/verify.test.tsx
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import VerifyScreen from '@/app/auth/verify';

describe('VerifyScreen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('verifies the code and pops back on success', async () => {
    const verifyEmail = jest.fn().mockResolvedValue({ ok: true });
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({ verifyEmail });
    const { mockBack } = require('../../../test-setup');
    const { getByLabelText, getByTestId } = render(<VerifyScreen />);
    fireEvent.changeText(getByLabelText('Verification code'), '123456');
    fireEvent.press(getByTestId('auth-submit'));
    await waitFor(() => expect(verifyEmail).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('shows an error for an invalid code', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      verifyEmail: jest.fn().mockResolvedValue({ ok: false, error: 'That code is invalid or expired.' }),
    });
    const { getByLabelText, getByTestId, findByText } = render(<VerifyScreen />);
    fireEvent.changeText(getByLabelText('Verification code'), '000000');
    fireEvent.press(getByTestId('auth-submit'));
    expect(await findByText('That code is invalid or expired.')).toBeOnTheScreen();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `bun test apps/mobile/src/__tests__/screens/verify.test.tsx`
Expected: FAIL — `@/app/auth/verify` not found.

- [ ] **Step 4: Implement the screen**

```tsx
// apps/mobile/src/app/auth/verify.tsx
import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthField, AuthScaffold, PrimaryButton } from '@/components/auth-ui';
import { useAuth } from '@/hooks/use-auth';

/**
 * Email-verification step (pushed from the register screen). The backend
 * mandates verification by code before a session is issued; the user enters the
 * code we emailed and, on success, the session becomes active and we pop back.
 */
export default function VerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { verifyEmail } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!code.trim()) {
      setError(t('auth.errorCodeRequired'));
      return;
    }
    setError(undefined);
    setSubmitting(true);
    const outcome = await verifyEmail(code.trim());
    setSubmitting(false);
    if (outcome.ok === true) requestAnimationFrame(() => router.back());
    else if (outcome.ok === false) setError(outcome.error);
  }

  return (
    <AuthScaffold title={t('auth.verifyTitle')} subtitle={t('auth.verifySubtitle')}>
      <View className="gap-4">
        <AuthField
          label={t('auth.verifyCode')}
          value={code}
          onChangeText={setCode}
          error={error}
          placeholder={t('auth.verifyCodePlaceholder')}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <PrimaryButton label={submitting ? t('auth.submitting') : t('auth.verifyCta')} onPress={submit} />
      </View>
    </AuthScaffold>
  );
}
```

- [ ] **Step 5: Register the route in `_layout.tsx`**

After the `auth/register` `Stack.Screen`:

```tsx
<Stack.Screen
  name="auth/verify"
  options={{ headerShown: true, title: t('auth.verifyTitle') }}
/>
```

- [ ] **Step 6: Run tests + typecheck**

Run: `bun test apps/mobile/src/__tests__/screens/verify.test.tsx && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/app/auth/verify.tsx apps/mobile/src/app/_layout.tsx packages/i18n/src/locales/en.json packages/i18n/src/locales/pt.json apps/mobile/src/__tests__/screens/verify.test.tsx
git commit -m "feat(mobile): add email verification screen"
```

---

### Task 11: Gate social buttons by mode

**Files:**
- Modify: `apps/mobile/src/app/auth/login.tsx`, `apps/mobile/src/app/auth/register.tsx`
- Modify: `apps/mobile/src/__tests__/screens/login.test.tsx` (assert visibility per mode)

**Design:** In real mode the backend has no OAuth, so hide the social buttons + the `OrDivider`. Show them only in mock mode (today's demo). Gate on `AUTH_ENABLED` from `@realty/data`.

- [ ] **Step 1: Write the failing test**

```tsx
// login.test.tsx (add) — real mode hides the OAuth button.
it('hides the social button in real-auth mode', () => {
  jest.resetModules();
  jest.doMock('@realty/data', () => ({ ...jest.requireActual('@realty/data'), AUTH_ENABLED: true }));
  const LoginReal = require('@/app/auth/login').default;
  const { queryByTestId } = render(<LoginReal />);
  expect(queryByTestId('oauth-button')).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test apps/mobile/src/__tests__/screens/login.test.tsx`
Expected: FAIL — the OAuth button still renders.

- [ ] **Step 3: Gate the social block**

In both `login.tsx` and `register.tsx`, import `AUTH_ENABLED` from `@realty/data` and wrap the `OrDivider` + `OAuthButton` so they render only when `!AUTH_ENABLED`:

```tsx
import { AUTH_ENABLED } from '@realty/data';
// …
{!AUTH_ENABLED ? (
  <>
    <OrDivider />
    <OAuthButton
      provider={provider}
      onPress={() =>
        completeAndDismiss(provider === 'apple' ? signInWithApple : signInWithGoogle)
      }
    />
  </>
) : null}
```

> Note: this refines spec §B4 — social buttons are shown only in mock mode; a future OAuth PR re-enables them in real mode. In real mode `signInWithGoogle`/`signInWithApple` are no longer returned by `useAuth()`, so they must only be referenced inside the `!AUTH_ENABLED` branch (they are).

- [ ] **Step 4: Run the full mobile suite + typecheck**

Run: `bun test apps/mobile && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/auth/login.tsx apps/mobile/src/app/auth/register.tsx apps/mobile/src/__tests__/screens/login.test.tsx
git commit -m "feat(mobile): hide social sign-in in real-auth mode"
```

---

## Final verification (before the last PR merges)

- [ ] `bun test` — all Jest suites pass.
- [ ] `bun run lint && bun run typecheck` — clean.
- [ ] `bun run test:e2e` — visual regression unchanged (mock path; flag off). Regenerate baselines only if an intentional UI change shows (the auth screens gain an inline error `Text` and, in mock mode, are otherwise unchanged).
- [ ] Manual (real mode): build with `EXPO_PUBLIC_AUTH_ENABLED=true` + `EXPO_PUBLIC_API_URL=<backend>`; register → read the code from the backend console → verify → confirm the profile shows the `name`; kill/relaunch to confirm the session rehydrates; sign out and confirm `/v1` data reloads as guest.

## Self-review notes (coverage vs spec)

- Spec B1 (auth-client, token-aware request, refresh) → Tasks 3–5. B2 (SecureStore, session in AsyncStorage) → Task 6 + Task 7 `applySession`. B3 (store refactor, hydration, signOut resets RQ) → Task 7. B4 (flag, mock path, social gating) → Tasks 2 & 11. B5 (login/register/verify/logout, single password, i18n) → Tasks 8–10 + profile's existing `signOut`. B6 (tests, deterministic visual regression) → tests in every task + final verification.
- Open item carried into execution: verify-email + refresh exact contract (Task 1). `auth-client.ts` marks both `CONTRACT TO CONFIRM`.
- Web-dev only: the Metro proxy (`/realty-api`) must also forward `/_allauth/*` for browser testing of real auth; native/prod use the absolute `API_URL` and are unaffected. Confirm/extend the proxy if exercising real auth on web.
