/**
 * Plausible analytics configuration, read from Expo public env vars.
 *
 * `EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time. Analytics
 * ships **off**: set `EXPO_PUBLIC_PLAUSIBLE_ENABLED=true` (plus url + domain) in
 * a real build's env to turn it on. See `.env.example`.
 */

export interface AnalyticsConfig {
  /** Master switch — `EXPO_PUBLIC_PLAUSIBLE_ENABLED === 'true'`. */
  enabled: boolean;
  /** Base URL of the self-hosted Plausible instance, no trailing slash. */
  url: string;
  /** The Plausible site domain (matches the site created in the dashboard). */
  domain: string;
}

export function readConfig(): AnalyticsConfig {
  return {
    enabled: process.env.EXPO_PUBLIC_PLAUSIBLE_ENABLED === 'true',
    url: (process.env.EXPO_PUBLIC_PLAUSIBLE_URL ?? '').replace(/\/+$/, ''),
    domain: process.env.EXPO_PUBLIC_PLAUSIBLE_DOMAIN ?? '',
  };
}

/**
 * The web dev server and Playwright e2e both run under a browser DOM with a
 * non-production `NODE_ENV`. Analytics no-ops there so local/CI runs never emit
 * events. Mirrors the `isWebDev` check in `packages/data/src/env.ts`.
 */
export function isWebDev(): boolean {
  return typeof document !== 'undefined' && process.env.NODE_ENV !== 'production';
}
