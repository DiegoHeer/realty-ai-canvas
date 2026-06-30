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
 * API contract version the client speaks, sent as `api_version` on
 * `/v1/residences`. `2` selects the paginated `ResidencePage` envelope;
 * absent/`1` is the legacy bare array. Bump only on breaking response changes.
 */
export const API_VERSION = 2;
