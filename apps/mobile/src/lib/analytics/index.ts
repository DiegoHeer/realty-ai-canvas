/**
 * Anonymous, cookieless usage analytics via a self-hosted Plausible instance.
 *
 * - `track()` / `trackPageview()` — fire-and-forget event ingest (no-op unless
 *   enabled via env and the user hasn't opted out).
 * - `useScreenView()` — mount once in the root layout to auto-track pageviews.
 * - `useAnalyticsOptOut()` — drives the opt-out toggle on the privacy screen.
 */
export { track, trackPageview } from './client';
export type { EventProps, TrackOptions } from './client';
export {
  AnalyticsEvent,
  trackEmailVerified,
  trackFiltersApplied,
  trackListingFavorited,
  trackLogin,
  trackOnboardingCompleted,
  trackOnboardingStep,
  trackOutboundLink,
  trackOverlayEnabled,
  trackSearch,
  trackSignup,
} from './events';
export type { AuthMethod, SearchMethod } from './events';
export { isHydrated, isOptedOut, setOptedOut, useAnalyticsOptOut } from './opt-out';
export { useScreenView } from './use-screen-view';
