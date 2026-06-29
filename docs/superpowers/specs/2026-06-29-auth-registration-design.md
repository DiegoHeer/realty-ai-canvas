# Authentication & Registration — Design

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending implementation plan
**Repos involved:** `realty-ai-canvas` (mobile, this repo) + `realty-alerts` (backend API)

## Goal

Replace the mock authentication in the mobile app with real authentication and
registration against the backend API. Scope is **account identity + token
plumbing**: real signup / login / email-verification / logout against the
backend, persist the JWT, and attach it as a `Bearer` token to all `/v1`
requests so endpoints "just work" once the backend starts gating them. No new
per-user features (favorites, saved searches, alerts) in this round.

## Background

- The mobile app (`realty-ai-canvas`) currently ships a **UI-complete but
  fully mocked** auth flow: `apps/mobile/src/hooks/use-auth.ts` is a
  `useSyncExternalStore` store whose sign-in helpers synthesize a session with
  no network call. Login/register screens, shared auth UI, the profile guest
  card, i18n keys (EN+PT), and tests all exist.
- The backend (`realty-alerts`, PR #189 — `feat(api): add JWT authentication
  infrastructure via django-allauth headless`) adds **JWT auth
  infrastructure only**:
  - `django-allauth[headless]>=65.18`, JWT token strategy (RS256, 30-min
    access / 7-day refresh, refresh rotation on).
  - Headless endpoints mounted at `/_allauth/` (clients `("app",)`,
    `HEADLESS_ONLY=True` → live routes under `/_allauth/app/v1/...`).
  - **`/v1/*` data endpoints remain public** in this PR. Gating is applied
    per-endpoint in follow-up PRs.
  - Mandatory email verification **by code**. Dev/CI uses the console email
    backend (codes printed to stdout); SMTP is a follow-up PR.
  - No social login yet (Google/Apple are a follow-up PR).
  - `/internal/v1` keeps its existing `InternalApiKey` auth.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Auth model | **Not a hard gate.** Data is public; auth is an account feature. |
| 2 | Scope | Account identity + token plumbing only. |
| 3 | Email verification UI | Build the verify-by-code screen, **feature-flagged**. |
| 4 | Token storage | **SecureStore** (expo-secure-store) — intentional exception to the AsyncStorage-only rule for sensitive credentials. |
| 5 | Social login buttons | Hide behind the same feature flag until backend OAuth exists. |
| 6 | Registration `name` field | **Keep it** — extend the backend PR to accept, persist, and return `name`. |
| 7 | Password reset | Out of scope (follow-up PR). |
| 8 | Endpoint contract | Build against the allauth-headless 65.18 docs **and** payloads captured from the running PR branch. |

## Workstreams

This effort spans two repos. The backend workstream is a **prerequisite** for
the mobile registration flow to round-trip a display name.

### Workstream A — Backend (`realty-alerts`, extends PR #189)

Add display-name support to headless signup.

1. **Accept `name` on signup.** Add a custom signup form/adapter so the
   headless signup endpoint accepts a `name` field and persists it onto the
   Django `User` (store the full display name in `first_name`; `last_name`
   left empty for now). In allauth this is typically a custom `ACCOUNT_FORMS`
   signup form + an `ACCOUNT_ADAPTER.save_user` override. Confirm the exact
   hooks for allauth 65.18.
2. **Return `name` in the user payload.** Customize the headless user
   serialization (adapter `serialize_user` or equivalent) so `name` is present
   in the `user` object returned by login / session endpoints — otherwise the
   app cannot read it back.
3. **Tests** for: signup with name persists it; the user payload includes it;
   signup still validates email + passwords.
4. Follow `realty-alerts` conventions: `make test` + `make pre-commit` green,
   ruff + ty pass, Conventional Commits, atomic commits, worktree workflow,
   merge-commit PRs.

A standalone prompt for this workstream lives at
`docs/superpowers/specs/2026-06-29-backend-name-field-prompt.md`.

### Workstream B — Mobile (`realty-ai-canvas`, this repo)

#### B1. Network layer (`packages/data`)

- **`auth-client.ts`** — typed functions hitting the allauth headless
  app-client endpoints: `signup`, `login`, `verifyEmail`, `getSession`,
  `logout`, `refresh`. Exact paths/payloads confirmed in the first
  implementation step (e.g. `POST /_allauth/app/v1/auth/signup`,
  `/auth/login`, `/auth/session`, email verify, token refresh). The client
  interface is written to be contract-agnostic so the verified shapes slot in.
- **Token-aware `request<T>()`** (`client.ts`) — attaches
  `Authorization: Bearer <access>` to `/v1` calls when a token exists. On
  `401`: run a **single-flight refresh** (one shared in-flight promise so
  concurrent 401s don't stampede), retry the original request **once**; on
  refresh failure, clear the session and reset the React Query cache (logout).
  Auth endpoints themselves are exempt from the interceptor.
- A small token accessor the wrapper reads (kept out of React state so the
  interceptor works outside components).

#### B2. Persistence

- **`apps/mobile/src/lib/secure-tokens.ts`** — expo-secure-store wrapper for
  the access + refresh tokens. Best-effort try/catch like `storage.ts`
  (failures resolve to a safe default, never throw). `get`/`set`/`clear`.
- The non-sensitive user profile (`{ name, email, avatarUrl? }`) stays in
  AsyncStorage under the existing `realty:session` key.
- Document the SecureStore exception in `CLAUDE.md` (Storage section) so the
  deviation from "AsyncStorage only" is intentional and recorded.

#### B3. Auth store (`apps/mobile/src/hooks/use-auth.ts`)

- Refactor from mock to real: sign-in/register/verify helpers become **async**
  and return success/error. The `useAuth()` return shape stays as close to
  today's as possible so the guest card / profile consumers change minimally.
- Hydration restores the session from AsyncStorage + tokens from SecureStore
  at boot.
- `signOut()` calls the backend session-delete, clears SecureStore, clears the
  `realty:session` key, and resets the React Query cache.

#### B4. Feature flag

- **`EXPO_PUBLIC_AUTH_ENABLED`** (default `false`), read in
  `packages/data/src/env.ts` alongside the existing flags.
  - **Off** (current reality): app keeps current behavior; the mock auth path
    stays active for dev + visual-regression determinism (which run
    `EXPO_PUBLIC_USE_MOCKS=true`).
  - **On** (when backend SMTP + OAuth are ready): full real flow —
    register → email-verify → login — and the social buttons become visible.
- Per decisions 3 & 5, the email-verify screen and the social buttons both
  ride this single flag. Splitting into two flags later (if SMTP and OAuth
  land at different times) is trivial.

#### B5. Screens & i18n

- **Login** — real `signInWithEmail`; surface server errors (bad credentials,
  unverified account).
- **Register** — keep the Name field (maps to backend `name` per Workstream A);
  **add a confirm-password field** (backend wants `password1` + `password2`).
- **Verify-email** — *new* screen: "enter the code we emailed you" → calls the
  verify endpoint → session becomes active. Flag-gated.
- **Logout** — wired to the real `signOut()`.
- New i18n keys (EN + PT) for confirm-password, the verify screen, and
  server-error messages.

#### B6. Testing

- Unit: `auth-client` (mocked fetch), the 401 → single-flight-refresh → retry
  interceptor, the refactored `use-auth` store.
- Component: login / register / verify screens (RNTL).
- Visual regression stays deterministic via the mock path (flag off,
  `EXPO_PUBLIC_USE_MOCKS=true`).
- Principle (per project CLAUDE.md): tests define expected behavior; fix source
  to match correct behavior, don't weaken tests.

## First implementation step

Before writing the mobile `auth-client`: read the django-allauth headless
65.18 docs for the documented app-client contract **and** run the PR #189
branch locally to capture the real request/response payloads from
`/_allauth/app/v1/auth/*` (token location, verify-by-code payload, user-object
shape — including the new `name` field once Workstream A lands). Build against
verified shapes.

## Out of scope (follow-ups)

- Password reset / forgot-password UI.
- Social login (Google/Apple) wiring — backend OAuth doesn't exist yet.
- Per-user backend features (favorites, saved searches, alerts).
- Gating `/v1` endpoints (backend follow-up).
- SMTP email backend (backend follow-up).

## Risks / open items

- **Exact allauth contract** (token refresh path, verify payload, user
  serialization) is library-defined and version-specific — resolved by the
  first implementation step.
- **Mandatory email verification + no SMTP** means registration can't
  round-trip end-to-end for real users until SMTP lands; the feature flag
  prevents shipping that dead-end.
- **Cross-repo ordering:** mobile registration depends on Workstream A
  (backend `name` support) being merged first.
