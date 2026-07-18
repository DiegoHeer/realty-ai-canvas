/**
 * Marketing attribution appended to every link that sends the user to an
 * external realtor site, so referral traffic is attributed to the app in the
 * realtor's own analytics. Separate from (and in addition to) the in-app
 * Plausible `outboundLinkEvent` tracking in {@link ./events}.
 */
const UTM_PARAMS = 'utm_source=huismusapp.com&utm_medium=referral';

/**
 * Append the app's UTM params to `url`, merging with any existing query
 * string (`&`) or adding one (`?`) if there is none. Manual string handling,
 * like {@link hostOf} in `./events` — React Native's URL implementation is
 * only partially implemented, so we don't rely on `new URL()`.
 *
 * No-ops if `url` already carries a `utm_source` (ours from a repeat share,
 * or the realtor's own) — appending ours on top would just produce a
 * duplicate, ambiguous query key.
 */
export function withUtmParams(url: string): string {
  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);

  if (/[?&]utm_source=/.test(base)) return url;

  const queryIndex = base.indexOf('?');
  const hasQueryParams = queryIndex !== -1 && queryIndex < base.length - 1;
  const separator = queryIndex === -1 ? '?' : hasQueryParams ? '&' : '';

  return `${base}${separator}${UTM_PARAMS}${hash}`;
}
