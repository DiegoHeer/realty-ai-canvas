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
