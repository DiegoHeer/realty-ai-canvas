/**
 * Typed, centralised catalogue of the custom analytics events (Plausible
 * "goals") and virtual pageviews the app emits, layered on the fire-and-forget
 * {@link track} / {@link trackPageview} primitives.
 *
 * Two layers, mirroring client.ts's "pure core + thin wrapper" split so the
 * mapping from arguments to the Plausible payload is unit-testable without a
 * network:
 *   - `…Event()` builders return a pure {@link EventSpec} (name + options).
 *   - `track…()` wrappers hand that spec to {@link track}. All gating
 *     (enabled / opted-out / hydrated) lives in `track`, so callers never gate.
 *
 * PRIVACY: properties carry only feature identifiers the *app* owns (auth
 * method, outbound host, search result *type*) or aggregate *counts* — never a
 * value the *user* supplied (price, city/place name, chosen filter values). This
 * keeps the privacy screen's "searches and preferences are never collected"
 * promise literally true. See docs/plausible-analytics.md.
 */
import { track, trackPageview, type EventProps, type TrackOptions } from './client';

/** Custom-event goal names — MUST match the goals configured in the Plausible dashboard. */
export const AnalyticsEvent = {
  outboundLink: 'Outbound Link',
  signup: 'Signup',
  login: 'Login',
  onboardingCompleted: 'Onboarding Completed',
  search: 'Search',
  filtersApplied: 'Filters Applied',
  listingFavorited: 'Listing Favorited',
} as const;

/** How a sign-up / sign-in was performed. */
export type AuthMethod = 'email' | 'google';
/** How a search was initiated. */
export type SearchMethod = 'typed' | 'suggestion' | 'recent';

/** A resolved event ready to hand to {@link track} — pure, so tests can assert it. */
export interface EventSpec {
  name: string;
  opts?: TrackOptions;
}

// Route pattern attached to page-anchored events (Plausible reads the pathname
// of the synthetic url), matching the router's patterns from route-pattern.ts.
const LISTING_PATH = '/listing/:id';

/**
 * Onboarding step slugs in page order — mirrors the `pages` array in
 * components/onboarding/flow.tsx. Emitted as virtual pageviews
 * `/onboarding/<slug>` so each step is a Plausible "page"; since CE has no
 * funnel view, the tour then reads as a descending series in Top Pages.
 */
export const ONBOARDING_STEP_SLUGS = [
  'welcome',
  'features',
  'filters',
  'cities',
  'account',
] as const;

/**
 * Derive a hostname from a URL without `new URL()` (React Native's URL is only
 * partially implemented). Drops scheme, userinfo, port and a leading `www.` so
 * outbound clicks group by broker (e.g. `funda.nl`). Returns '' if unparseable.
 */
export function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  if (!match) return '';
  const authority = match[1].split('@').pop() ?? '';
  return authority.split(':')[0].toLowerCase().replace(/^www\./, '');
}

// --- Pure event builders ---------------------------------------------------

export function outboundLinkEvent(url: string, sourceName: string, position: number): EventSpec {
  const props: EventProps = { host: hostOf(url), source_name: sourceName, position };
  return { name: AnalyticsEvent.outboundLink, opts: { path: LISTING_PATH, props } };
}

export function signupEvent(method: AuthMethod): EventSpec {
  return { name: AnalyticsEvent.signup, opts: { path: '/auth/register', props: { method } } };
}

export function loginEvent(method: AuthMethod): EventSpec {
  return { name: AnalyticsEvent.login, opts: { path: '/auth/login', props: { method } } };
}

export function onboardingCompletedEvent(o: {
  skipped: boolean;
  citiesSelected: number;
}): EventSpec {
  return {
    name: AnalyticsEvent.onboardingCompleted,
    opts: { path: '/onboarding', props: { skipped: o.skipped, cities_selected: o.citiesSelected } },
  };
}

export function searchEvent(resultType: string, method: SearchMethod): EventSpec {
  return { name: AnalyticsEvent.search, opts: { props: { result_type: resultType, method } } };
}

export function filtersAppliedEvent(activeFilterCount: number): EventSpec {
  return {
    name: AnalyticsEvent.filtersApplied,
    opts: { path: '/settings/filters', props: { active_filter_count: activeFilterCount } },
  };
}

export function listingFavoritedEvent(): EventSpec {
  return { name: AnalyticsEvent.listingFavorited };
}

/** Virtual pageview path for onboarding step `index`, or null if out of range. */
export function onboardingStepPath(index: number): string | null {
  const slug = ONBOARDING_STEP_SLUGS[index];
  return slug ? `/onboarding/${slug}` : null;
}

// --- Thin fire-and-forget wrappers -----------------------------------------

function send(spec: EventSpec): void {
  track(spec.name, spec.opts);
}

export function trackOutboundLink(url: string, sourceName: string, position: number): void {
  send(outboundLinkEvent(url, sourceName, position));
}
export function trackSignup(method: AuthMethod): void {
  send(signupEvent(method));
}
export function trackLogin(method: AuthMethod): void {
  send(loginEvent(method));
}
export function trackOnboardingCompleted(o: { skipped: boolean; citiesSelected: number }): void {
  send(onboardingCompletedEvent(o));
}
export function trackSearch(resultType: string, method: SearchMethod): void {
  send(searchEvent(resultType, method));
}
export function trackFiltersApplied(activeFilterCount: number): void {
  send(filtersAppliedEvent(activeFilterCount));
}
export function trackListingFavorited(): void {
  send(listingFavoritedEvent());
}

/** Fire a virtual pageview for onboarding step `index` (no-op if out of range). */
export function trackOnboardingStep(index: number): void {
  const path = onboardingStepPath(index);
  if (path) trackPageview(path);
}
