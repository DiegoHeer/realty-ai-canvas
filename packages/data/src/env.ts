/**
 * Runtime configuration, read from Expo public env vars.
 *
 * `EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time and are
 * safe to reference on every platform (native + web).
 */

/** Base URL of the listings API (the Realty Alerts backend). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

/**
 * What `request()` actually prefixes onto paths.
 *
 * The API serves no CORS headers, so on the **web dev server** we route through
 * a same-origin Metro proxy (`/realty-api/*`, see apps/mobile/metro.config.js)
 * instead of calling the backend cross-origin. Native and production builds use
 * the absolute `API_URL` directly. `typeof document` is the cheapest reliable
 * web check that doesn't pull in `react-native`'s `Platform`.
 */
const isWebDev =
  typeof document !== 'undefined' && process.env.NODE_ENV !== 'production';
export const API_BASE = isWebDev ? '/realty-api' : API_URL;

/**
 * Turn on real backend authentication (allauth headless JWT). Off by default,
 * so the app keeps the mock auth path — which is also the deterministic
 * visual-regression path. Set EXPO_PUBLIC_AUTH_ENABLED=true to use the real
 * signup/login/verify flow and attach Bearer tokens to /v1 requests.
 */
export const AUTH_ENABLED = process.env.EXPO_PUBLIC_AUTH_ENABLED === 'true';

/**
 * Google OAuth Web client id, used two ways for native Google Sign-In:
 *   1. as the Google Sign-In `webClientId` (so the returned id_token's audience
 *      is this Web client), and
 *   2. as `token.client_id` in the allauth `provider/token` request body — the
 *      backend requires it to equal the Web client id the id_token is scoped to.
 * Empty when unset; the sign-in flow only runs in real mode with this configured.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

/**
 * Google OAuth iOS client id, passed to Google Sign-In as `iosClientId` so the
 * native iOS flow uses the right client. Empty when unset (e.g. Android-only).
 */
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/**
 * API contract version the client speaks, sent as `api_version` on
 * `/v1/residences`. `2` selects the paginated `ResidencePage` envelope;
 * absent/`1` is the legacy bare array. Bump only on breaking response changes.
 */
export const API_VERSION = 2;
