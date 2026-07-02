# Native Google Sign-In (mobile)

Wire the no-op `signInWithGoogle()` to a real native Google flow using
`@react-native-google-signin/google-signin`, talking to the allauth headless
`provider/token` endpoint. Google only; Apple stays hidden. Account linking is
backend-side (auto-link by verified email); the app just sends the id_token.

## Backend contract
- `POST {API_URL}/_allauth/app/v1/auth/provider/token`
- Body: `{ provider:"google", process:"login", token:{ client_id:<WEB_CLIENT_ID>, id_token:<idToken> } }`
- Success 200: same envelope as `/auth/login` (tokens in `meta`, user in `data.user`).
- Failure 400/401: allauth `errors[]` body (reuse existing mapping).

## Tasks (TDD: failing test first, then code, commit per task)

### T1 — deps + build config
- `bun add` `@react-native-google-signin/google-signin@^16` in `apps/mobile`.
- Add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` + `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` to
  `packages/data/src/env.ts` (empty string when unset). No real values.
- Register the config plugin in `apps/mobile/app.json` with
  `iosUrlScheme` sourced from the iOS client id's reversed form — but since we
  can't compute it from env in a static app.json, use the documented
  `iosUrlScheme` placeholder; leave a note. Actually the plugin needs a literal.
  -> Use app.json plugin with `iosUrlScheme` = reversed iOS client id; since it
  must be static and we don't invent ids, wire it via app config. Keep app.json
  static: plugin entry with `iosUrlScheme` referencing the value the human must
  fill. Document as a manual step.
- Add `eas.json` (root) with development (developmentClient+internal), preview,
  production profiles.
- Commit: `build(mobile): add google-signin dep, config plugin and eas profiles`.

### T2 — auth-client.loginWithProviderToken
- Test in `packages/data/src/__tests__/auth-client.test.ts` mirroring `login()`:
  mocked fetch, assert POST to `/auth/provider/token`, body shape, returns the
  same `AuthSession`; failure surfaces `invalid_credentials` code.
- Implement `loginWithProviderToken({ provider, idToken, clientId })` in
  `auth-client.ts`.
- Commit: `feat(mobile): add loginWithProviderToken auth-client call`.

### T3 — use-auth real signInWithGoogle
- Test `use-auth.test.ts` real-mode: mock the google-signin module + the
  auth-client fn; assert session established + tokens persisted on success;
  user-cancel handled (no crash, no session, returns generic/cancel outcome).
- Implement `realSignInWithGoogle`: configure GoogleSignin once
  ({ webClientId, iosClientId, scopes:['email','profile'] }), hasPlayServices,
  signIn, extract idToken, loginWithProviderToken, applySession/saveTokens.
  Map user-cancel via statusCodes.SIGN_IN_CANCELLED to a graceful no-op outcome.
- Add a `cancelled` code path if the existing set doesn't cover it (it maps to
  `ok:false, code:'cancelled'` -> add to AuthErrorCode + authErrorKey + i18n).
- `signInWithGoogle` now returns `Promise<AuthOutcome>`.
- Commit: `feat(mobile): implement native google sign-in in use-auth`.

### T4 — UI wiring
- Show Google `OAuthButton` in real mode (AUTH_ENABLED) on login + register,
  forcing provider `google` (not defaultOAuthProvider, which picks Apple on iOS).
  Keep Apple hidden. Preserve mock-mode behavior.
- Commit: `feat(mobile): show google oauth button in real auth mode`.

### T5 — i18n
- Add any new user-facing keys (e.g. cancel handled silently -> maybe none) to
  en/nl/pt. If a `cancelled` code surfaces a message, add it to all three.
- Commit folded into T3 if strings introduced, else skip.

## Verify
- `bun --filter '@realty/mobile' test`, `bun --filter '*' typecheck`,
  `bun --filter '@realty/mobile' lint`. Fix failures. Repo green each commit.

## Manual steps (human)
- Create Google Cloud OAuth clients (Web + iOS + Android). Set env:
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
- Fill `iosUrlScheme` in app.json plugin (reversed iOS client id).
- `EXPO_PUBLIC_AUTH_ENABLED=true` to exercise real flow.
- Build a dev client: `eas build --profile development --platform ios|android`.
</content>
</invoke>
