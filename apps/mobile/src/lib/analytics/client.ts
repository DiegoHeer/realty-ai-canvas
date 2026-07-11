import { AnalyticsConfig, readConfig } from './config';
import { isHydrated, isOptedOut } from './opt-out';
import { buildUserAgent } from './user-agent';

export type EventProps = Record<string, string | number | boolean>;

export interface EventBody {
  name: string;
  url: string;
  domain: string;
  props?: EventProps;
}

export interface TrackOptions {
  /** Page path the event belongs to, e.g. `/listing/:id`. Defaults to `/`. */
  path?: string;
  /** Custom event properties. Never include PII. */
  props?: EventProps;
}

/**
 * Build the Plausible `/api/event` body. `url` is synthetic — Plausible only
 * reads the pathname from it — so we pin the host to the site domain.
 */
export function buildEventBody(
  domain: string,
  name: string,
  opts?: TrackOptions,
): EventBody {
  const path = opts?.path ?? '/';
  const body: EventBody = { name, domain, url: `https://${domain}${path}` };
  if (opts?.props && Object.keys(opts.props).length > 0) body.props = opts.props;
  return body;
}

/** Gating predicate — pure so it can be exhaustively unit-tested. */
export function shouldTrack(
  config: AnalyticsConfig,
  optedOut: boolean,
  hydrated: boolean,
): boolean {
  return hydrated && config.enabled && !!config.url && !!config.domain && !optedOut;
}

/**
 * POST an event to Plausible. Fire-and-forget: swallows every error (network,
 * non-202, dropped) so analytics can never affect the UI. Assumes the caller
 * has already gated on {@link shouldTrack}.
 */
export function sendEvent(
  config: AnalyticsConfig,
  name: string,
  opts?: TrackOptions,
): void {
  void fetch(`${config.url}/api/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': buildUserAgent(),
    },
    body: JSON.stringify(buildEventBody(config.domain, name, opts)),
  }).catch(() => {
    // Analytics must never surface to the user.
  });
}

const CONFIG = readConfig();

/** Track a custom event (or `pageview`). No-op unless analytics is enabled. */
export function track(name: string, opts?: TrackOptions): void {
  if (!shouldTrack(CONFIG, isOptedOut(), isHydrated())) return;
  sendEvent(CONFIG, name, opts);
}

/** Convenience wrapper for the screen-view hook. */
export function trackPageview(path: string): void {
  track('pageview', { path });
}
