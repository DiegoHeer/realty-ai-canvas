# Google & Apple OAuth (Social Login) — Implementation Plan

**Audience:** the backend developer for the Realty Alerts API (`api-staging.realty-ai.nl`)
**and** the mobile devs wiring the Expo client.
**Scope:** add "Continue with Google" / "Continue with Apple" sign-in across **web + Android**
(iOS is a later milestone — see [§9](#9-sequencing--milestones)). Companion to the
backend specs under [`./backend/`](./backend/); it follows the JWT-identity and
validation/error conventions of [`residences-search-api.md`](./backend/residences-search-api.md).

> **Status (as built, 2026-07-04): Google is implemented end to end via the _token_ flow —
> "Path A" (redirect) was dropped.** The §3 spike was resolved against the django-allauth
> 65.18 source: for `app` clients the redirect flow is a dead end — the kickoff view runs in a
> swapped-in server-side session whose cookie the browser never receives (so the OAuth `state`
> round-trip breaks), and on success the callback redirect carries **no session token** (the
> flow assumes a cookie-sharing `browser` client; see
> `allauth/headless/socialaccount/internal.py::complete_login`). The backend's provider-token
> implementation (realty-alerts PR #218, merged; PR #220 adds the native client ids) is the
> allauth-supported path, so the client follows it.
>
> **As built:**
>
> | Piece | Where |
> |---|---|
> | Google id_token acquisition (web: OIDC implicit + nonce in a popup; Android/iOS: code+PKCE) | `apps/mobile/src/lib/google-auth.ts` (expo-auth-session, imperative `AuthRequest`) |
> | JWT exchange: `POST /_allauth/app/v1/auth/provider/token` → `applySession()` | `packages/data/src/auth-client.ts` (`providerTokenLogin`), `use-auth.ts` (`realSignInWithGoogle`) |
> | Web popup return | `apps/mobile/src/app/auth/callback.tsx` (`maybeCompleteAuthSession`), redirect URI `<origin>/auth/callback` |
> | Buttons in real mode (Google only, shown when the platform's client id is set) | `auth/login.tsx`, `auth/register.tsx` |
> | Error copy | `auth.errorOauthCancelled` / `auth.errorOauthFailed` (en/nl/pt), mapped in `authErrorKey` |
> | Client ids | `EXPO_PUBLIC_GOOGLE_{WEB,ANDROID,IOS}_CLIENT_ID` (`apps/mobile/.env`, gitignored) |
> | Backend env | `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` (+ optional `_ANDROID_CLIENT_ID`, `_IOS_CLIENT_ID`) |
> | Credential source of truth | `~/.config/realty-ai/google-oauth/` (Google console exports; **secret never in git**) |
>
> Verified live (2026-07-04, local backend + web dev server): real-mode button renders, the
> popup reaches `accounts.google.com` with the Web client id and
> `redirect_uri=<origin>/auth/callback`, and Google answers `redirect_uri_mismatch` — i.e.
> everything on our side works; see the checklist below.
>
> **Remaining checklist (owner actions):**
>
> 1. **Google console → Web client → Authorized redirect URIs:** add
>    `http://localhost:8081/auth/callback` (+ any other dev ports in use, e.g. `:8095`) and the
>    deployed web origin's `/auth/callback`. Same screen: add the matching **Authorized
>    JavaScript origins**.
> 2. **Staging deployment (realty-ai-platform):** set `GOOGLE_OAUTH_CLIENT_ID` and
>    `GOOGLE_OAUTH_CLIENT_SECRET` **before the next image rollout** — `prod.py` refuses to boot
>    without them now that #218 is merged. Optionally `GOOGLE_OAUTH_ANDROID_CLIENT_ID` /
>    `GOOGLE_OAUTH_IOS_CLIENT_ID` (PR #220) when native ships.
> 3. **Android:** the reversed-client-id scheme
>    (`com.googleusercontent.apps.751654542404-066oobvgungucgk2v8diuoedas0atha2`) is now
>    registered in `app.json`. The package id is pinned to `com.fastvibes.huismus` (previously
>    `com.anonymous.realtyaicanvas`, then `com.anonymous.huismus`) — **owner action still
>    needed:** update the Android OAuth client in Google Cloud Console to package name
>    `com.fastvibes.huismus` and re-register the signing SHA-1 (the project-local debug
>    keystore's fingerprint; see `apps/mobile/android/app/debug.keystore`).
> 4. **Static web export:** confirm `/auth/callback` is served by the production host / e2e
>    static server (dev server routes it fine).
>
> The sections below are the original plan, kept for context. §1–§3's Path-A rationale is
> **superseded** by the spike outcome above; §5's console guidance is updated by the checklist.

---

## 1. Why "Path A" (redirect) — and what it buys us

The OAuth code-exchange happens **server-side, between the provider and the allauth backend**
(the backend holds the client secret). The device only ever talks to allauth. Consequences:

- **No OAuth client secret on the device**, so **no native Google/Apple SDK** → **no
  `expo prebuild`, no new native dependencies, and no SHA-1 signing fingerprints** (contrast the
  native provider-token path). `expo-web-browser` and `expo-linking` are already installed.
- **One Google _Web_ OAuth client covers web + Android + iOS**, because the device never uses a
  Google client id directly.
- **One Apple _Services ID_ covers web + Android** (the browser flow). Native iOS "Sign in with
  Apple" is a separate, later milestone.

The trade-off vs. the native path is UX: the user sees a browser/custom-tab sheet rather than a
fully native account picker. Accepted, for the setup savings above.

---

## 2. The flow

1. User taps **Continue with Google/Apple**.
2. The app opens a browser auth session (`WebBrowser.openAuthSessionAsync(startUrl, returnUrl)`)
   that reaches `POST /_allauth/app/v1/auth/provider/redirect` with
   `{ provider, callback_url, process: "login" }`.
3. allauth `302`s to the provider; the user authenticates; the provider calls back to allauth;
   allauth completes the code exchange **server-side**.
4. allauth redirects the browser to our `callback_url`:
   - **Web:** an Expo Router route, e.g. `https://<web-origin>/auth/callback`.
   - **Android:** the deep link `realtyaicanvas://auth/callback` — `openAuthSessionAsync`
     resolves with the full return URL.
5. The app reads the session identifier off the return URL, obtains the **JWT access + refresh**
   tokens, and calls the existing `applySession()` in `apps/mobile/src/hooks/use-auth.ts`.
   Everything downstream — the Bearer interceptor, single-flight refresh, keychain storage, boot
   hydration — already works unchanged.

```
app ──POST /auth/provider/redirect {provider, callback_url, process}──▶ allauth
                                                                          │ 302
                             browser ◀────────────────────────────────────┘
                             │  user authenticates
provider ◀───────────────────┘
   │  code
   └──▶ allauth  (server-side code exchange — holds the client secret)
             │  302 → callback_url  (+ session identifier)
   app ◀─────┘   → exchange for JWT → applySession()
```

---

## 3. ⚠️ Two mechanics to confirm by spike (do NOT code these blind)

Neither is documented clearly enough to implement without a live, configured endpoint. Both are
~1–2 h to pin down once [§4](#4-backend--django-allauth) is live; this is the reason for
backend-first sequencing.

1. **Redirect kickoff.** `/auth/provider/redirect` is **POST**-only and returns a `302`, but
   `openAuthSessionAsync` opens a **GET** URL. Candidate approaches: a small hosted
   auto-submitting `<form>` page (allauth's own demo pattern), a `data:` URL form, or confirming
   whether this allauth version accepts the params on a GET. **To be resolved against the live
   endpoint.**
2. **Token hand-off at `callback_url`.** The exact return is undocumented in what we could reach
   — most likely `?session_token=…` appended to `callback_url` (then exchanged for JWTs via the
   session/token endpoint), or the JWTs returned directly. **Resolve against the live endpoint or
   the allauth source.**

---

## 4. Backend — django-allauth  *(external repo — the critical blocker)*

Enable the headless socialaccount providers. Two provider `SocialApp`s (Google, Apple). Config
can live in the DB (admin) or in settings `APPS` — the settings form below is
infra-as-code-friendly and avoids `SITE_ID` coupling.

### 4.1 `INSTALLED_APPS`

```python
INSTALLED_APPS += [
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "allauth.socialaccount.providers.apple",
]
```

The headless socialaccount URLs mount automatically once the app is installed — no urlconf edit.

### 4.2 `SOCIALACCOUNT_PROVIDERS` (drop-in)

```python
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APPS": [{
            "client_id": "<GOOGLE_WEB_OAUTH_CLIENT_ID>",     # §5
            "secret": "<GOOGLE_WEB_OAUTH_CLIENT_SECRET>",    # §5
            "key": "",
        }],
        "SCOPE": ["openid", "email", "profile"],
        "AUTH_PARAMS": {"access_type": "online"},
    },
    "apple": {
        "APPS": [{
            "client_id": "<APPLE_SERVICES_ID>",   # e.g. nl.realty-ai.signin  (§6)
            "secret": "<APPLE_KEY_ID>",           # the 10-char Key ID
            "key": "<APPLE_TEAM_ID>",             # the 10-char Team ID
            "settings": {
                "certificate_key": """-----BEGIN PRIVATE KEY-----
<contents of the AuthKey_XXXXXXXXXX.p8>
-----END PRIVATE KEY-----""",
            },
        }],
    },
}
```

> allauth's Apple provider maps its fields unusually: **`client_id` = Services ID**,
> **`secret` = Key ID**, **`key` = Team ID**, and the `.p8` goes in `settings.certificate_key`.
> allauth builds Apple's real client secret (a signed JWT) from these at runtime.

### 4.3 Endpoints this exposes  *(provided by allauth — for reference)*

| Method & path | Body | Returns |
|---|---|---|
| `POST /_allauth/app/v1/auth/provider/redirect` | form: `provider`, `callback_url`, `process` (`"login"`) | `302` to the provider |
| `POST /_allauth/app/v1/auth/provider/token` | `{provider, process, token:{…}}` | *(native path — unused in Path A)* |
| `GET /_allauth/app/v1/config` | — | must now include a `socialaccount.providers` block |

### 4.4 Config the backend owner must confirm

- **`callback_url` allow-listing.** allauth guards against open redirects, so it must accept our
  callback values — the native scheme `realtyaicanvas://auth/callback` **and** the web origin(s)
  (`http://localhost:<port>` for web dev + the deployed web origin). Confirm the exact setting for
  your allauth version (adapter `is_safe_url` / allowed-origins policy) — do not hard-fail our
  scheme.
- **CORS.** The app calls `_allauth` **cross-origin** on web (see the header note in
  `packages/data/src/auth-client.ts`). Ensure `CORS_ALLOWED_ORIGINS` includes the web dev origin
  and the deployed web origin. (Existing email auth already needs this; social adds no new need.)
- **Token strategy parity.** Social login must return the **same JWT `meta.access_token` /
  `meta.refresh_token`** shape as `POST /auth/login`, so the client's `toSession()` /
  `applySession()` work unchanged.

> **Done-signal for the client team:** `GET …/config` shows `socialaccount.providers:[…]`, and
> `GET …/auth/provider/redirect` returns **405** (mounted, POST-only) rather than 404.

---

## 5. Google Cloud Console

- **OAuth consent screen:** app name, support email, authorized domains. Scopes
  `openid email profile` — all non-sensitive, so no Google verification review needed for these.
- **One "Web application" OAuth client.** Authorized redirect URI = allauth's Google callback
  (allauth default: `https://api-staging.realty-ai.nl/accounts/google/login/callback/` — backend
  confirms the exact path). Its **client id + secret** go into the Google `SocialApp` ([§4.2](#42-socialaccount_providers-drop-in)).

That single Web client serves web, Android, and iOS in this model — the OAuth is between Google
and the backend, not the device.

---

## 6. Apple Developer  *(paid membership required, even for the web/Android flow)*

- **App ID** with the "Sign in with Apple" capability (bundle id — see [§8](#8-decisions-to-make-now)).
- **Services ID** — this is the OAuth `client_id` for the web/Android browser flow. Configure its
  **Return URL** = allauth's Apple callback (`…/accounts/apple/login/callback/` — backend confirms).
- **Sign in with Apple key** → download the `.p8`; note its **Key ID** and your **Team ID**.
  These three feed the Apple `SocialApp` ([§4.2](#42-socialaccount_providers-drop-in)).

> If the paid account isn't ready, ship **Google-first** ([§9](#9-sequencing--milestones)) and add
> Apple when it is.

---

## 7. Client — Expo app  *(this repo)*

No new native deps expected, and **no prebuild** (pending the [§3](#3--two-mechanics-to-confirm-by-spike-do-not-code-these-blind) spike).

| File | Change |
|---|---|
| `packages/data/src/auth-client.ts` | Add `socialLogin(provider, callbackUrl)` — build the start URL, parse the callback → `AuthSession`; reuse `toSession` / `AuthError`. |
| `apps/mobile/src/hooks/use-auth.ts` | Implement `realSignInWithGoogle` / `realSignInWithApple` (open `openAuthSessionAsync`; handle `cancel` / `dismiss`; call `applySession`; return `AuthOutcome`). Wire them into `useAuth()` for `AUTH_ENABLED` — today they are no-ops (lines ~494–495). |
| `apps/mobile/src/app/auth/callback.tsx` *(new)* | Route to catch the web redirect + native deep link, finish the session, then `deferNavigation(() => router.back())` (respects the react-native-screens recycled-bitmap gotcha). |
| `apps/mobile/src/app/auth/login.tsx`, `register.tsx` | Show `OAuthButton` in **real** mode too — currently gated behind `!AUTH_ENABLED`. Make the handler async with error surfacing. |
| `apps/mobile/app.json` | Scheme is already `realtyaicanvas` — no change expected. |
| e2e serve config | Ensure `/auth/callback` survives the Expo **static** web export (add a rewrite if needed). |

---

## 8. i18n — `packages/i18n/src/locales/{en,nl,pt}.json`

`auth.continueWithGoogle`, `auth.continueWithApple`, and `auth.orDivider` already exist. Add
failure strings **in all three locales** and map them in `authErrorKey` (`auth-ui.tsx`):

- `auth.errorOauthCancelled` — user closed the browser sheet.
- `auth.errorOauthFailed` — provider/backend error.

---

## 9. Testing

- **Jest** (`bun run test`): unit-test the `socialLogin` helper (URL build + callback parse, with
  `fetch` / `expo-linking` mocked); test the hook's real social functions (mocked auth-client);
  component-test that the buttons render and fire the handler in real mode. Add an
  **`expo-web-browser` mock** to `apps/mobile/test-setup.ts`.
- **Playwright visual** (`bun run test:e2e`): capture login/register real-mode layout with the
  buttons; regenerate baselines (`bun run test:update-snapshots`).
- **Live — web** (`verifier-web`): run the Expo web export, click **Continue with Google**, assert
  the redirect to `accounts.google.com` **via network requests** (not the canvas), complete with a
  test account, and assert the authenticated state.
- **Live — Android** (`verifier-android`): dev build → tap → custom tab opens → deep-link return →
  session established. **The deep-link return is the main native risk.**

---

## 10. Sequencing & milestones

1. **Backend + Google console** stand up on staging ([§4](#4-backend--django-allauth), [§5](#5-google-cloud-console)) → hit the done-signal.
2. **Client spike** against the live Google redirect → resolve the [§3](#3--two-mechanics-to-confirm-by-spike-do-not-code-these-blind) unknowns.
3. **Google on Web** ([§7](#7-client--expo-app)) → verify.
4. **Extend to Android** → verify the deep-link return.
5. **Add Apple** (Services ID, [§6](#6-apple-developer)) on Web + Android → verify.
6. *(Out of Path A scope — later)* **iOS native Apple:** `expo-apple-authentication` + prebuild +
   an iOS build pipeline + App Store **Guideline 4.8** (offering Google on iOS obligates offering
   Sign in with Apple).

---

## 11. Decisions to make now  *(they gate console setup)*

- **Bundle / package id is pinned to `com.fastvibes.huismus`** (`app.json`, both platforms; was
  `com.anonymous.realtyaicanvas`, then briefly `com.anonymous.huismus`). Google console
  registrations (and any future Apple / iOS App Store setup) must be re-checked against this id.
- **Apple Developer membership** ($99/yr) is required even for the web/Android Apple flow. Confirm
  it's available, or ship Google-first and add Apple later.
