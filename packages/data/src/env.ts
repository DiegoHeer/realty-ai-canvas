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
