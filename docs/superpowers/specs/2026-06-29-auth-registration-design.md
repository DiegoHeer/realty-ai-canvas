# Authentication & Registration — Design

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — backend prerequisite merged; pending mobile implementation plan
**Repos involved:** `realty-ai-canvas` (mobile, this repo) + `realty-alerts` (backend API)

> **Update 2026-06-29:** Backend Workstream A landed — PR #189 is **merged** with
> display-name support and a **live-verified** endpoint contract (see the
> [Verified backend contract](#verified-backend-contract-pr-189) appendix). One
> correction propagated into this spec: headless signup uses a **single
> `password`** field (not `password1`/`password2`).

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
| 6 | Registration `name` field | **Kept** — backend PR #189 (merged) accepts a required `name`, stores it on `User.first_name`, and returns it as `name` on the user object. |
| 7 | Password reset | Out of scope (follow-up PR). |
| 8 | Endpoint contract | signup / login / session **verified live** (PR #189 body). verify-email + token-refresh paths to be confirmed against the running backend during implementation (allauth 65.18 docs as the reference). |
| 9 | Confirm-password field | **Dropped** — headless signup takes a single `password`; the original `password1`/`password2` rationale was wrong. Register stays name + email + password. (A purely client-side confirm field could be added later for UX; not required.) |

## Workstreams

This effort spans two repos. The backend workstream is a **prerequisite** for
the mobile registration flow to round-trip a display name.

### Workstream A — Backend (`realty-alerts`, PR #189) — ✅ DONE (merged 2026-06-29)

Display-name support landed in headless signup. Implemented via
`ACCOUNT_SIGNUP_FORM_CLASS = "scraping.forms.SignupForm"` (adds the required
`name` field, writes it to `User.first_name`) and
`HEADLESS_ADAPTER = "scraping.adapters.HeadlessAdapter"` (adds `name` to the
serialized user object + OpenAPI spec). Tests in `tests/test_signup.py`. The
verified request/response shapes are in the
[Verified backend contract](#verified-backend-contract-pr-189) appendix.

Original requirements (for the record):

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
  `logout`, `refresh`. Verified paths/shapes (see appendix): signup, login,
  session. Tokens live in `meta.access_token` / `meta.refresh_token`; the user
  object is `data.user` and the app displays its **`name`** field (not
  `display`/`username`, which auto-derive from the email local-part). `signup`
  returns **401** with a pending `verify_email` flow and a `meta.session_token`
  — no tokens until the email is verified. verify-email + refresh payloads are
  confirmed in the first implementation step. The client interface is
  contract-agnostic so verified shapes slot in.
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
- **Mock mode (flag off)** = today's behavior, unchanged, including the mock
  social buttons — this is the safe shipping default and the visual-regression
  path.
- **Real mode (flag on)** = real backend login/register/verify. The
  Google/Apple **social buttons are hidden in real mode** (the backend has no
  OAuth yet); a future OAuth PR re-enables them. The verify-email screen is
  part of the real register flow. This is the pragmatic reading of decisions
  3 & 5; splitting social onto its own flag later is trivial.

#### B5. Screens & i18n

- **Login** — real `signInWithEmail`; surface server errors (bad credentials,
  unverified account).
- **Register** — keep the Name field (maps to backend `name`); a **single
  password** field (backend takes one `password`, no confirm). On success the
  backend returns 401 + pending `verify_email`; the app advances to the
  verify-email screen carrying the `session_token`.
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

signup / login / session are already verified (appendix). The remaining
unknowns are the **email-verify-by-code** and **token-refresh** payloads —
confirm these against the running merged backend before writing those parts of
`auth-client.ts` (allauth 65.18 docs as the reference; candidate paths noted in
the appendix are from-docs, not yet repo-verified).

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
  (backend `name` support) being merged first. ✅ Resolved — merged.

## Verified backend contract (PR #189)

Base path: `/_allauth/app/v1`. Tokens are in `meta`; the user is in `data.user`.
Display the user's **`name`** (not `display`/`username`).

**Signup** — `POST /auth/signup` — `name` is **required**, single `password`:
```jsonc
// request
{ "email": "ada@example.com", "name": "Ada Lovelace", "password": "sup3rs3cret!" }
// response 401 — user created, email verification pending (mandatory), no tokens yet
{ "status": 401,
  "data": { "flows": [ { "id": "login" }, { "id": "signup" },
                       { "id": "verify_email", "is_pending": true } ] },
  "meta": { "is_authenticated": false, "session_token": "…" } }
```

**Login** — `POST /auth/login`:
```jsonc
// request
{ "email": "ada@example.com", "password": "sup3rs3cret!" }
// response 200
{ "status": 200,
  "data": { "user": { "id": 1, "display": "ada", "email": "ada@example.com",
                      "has_usable_password": true, "username": "ada",
                      "name": "Ada Lovelace" },
            "methods": [ … ] },
  "meta": { "is_authenticated": true, "access_token": "<JWT>",
            "refresh_token": "<JWT>", "session_token": "…" } }
```

**Session** — `GET /auth/session` with `Authorization: Bearer <access_token>`
→ same `data.user` (including `name`).

**To confirm during implementation (from-docs, not yet repo-verified):**
- **Email verify by code** — candidate `POST /auth/email/verify` with the code
  as the body field; carries the signup `session_token`. On success returns an
  authenticated session with `meta.access_token` / `meta.refresh_token`. Verify
  the exact path and field name against allauth 65.18 + the running backend.
- **Token refresh** — candidate `POST /auth/token/refresh` with the
  `refresh_token`; returns new `access_token` (+ rotated `refresh_token`, since
  `HEADLESS_JWT_ROTATE_REFRESH_TOKEN=True`). Confirm before building the
  refresh interceptor.
