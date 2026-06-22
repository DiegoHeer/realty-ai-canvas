/**
 * Format a price as a whole-unit currency string, e.g. "€675,000".
 * Pass the active language (e.g. i18n.language) so grouping/symbols localise.
 */
export function formatPrice(amount: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Elapsed time bucketed into the largest sensible unit (for "listed N ago" copy). */
export type RelativeTime =
  | { unit: 'today' }
  | { unit: 'day' | 'week' | 'month' | 'year'; count: number };

const MS_PER_DAY = 86_400_000;

/**
 * Bucket the time elapsed since the ISO timestamp `iso` into the largest
 * sensible unit, so callers can render a short relative phrase (e.g. "today",
 * "3 weeks"). `now` is injectable for deterministic tests. Returns `null` for an
 * unparseable timestamp. The unit/count pair is left for the UI layer to
 * pluralise and localise (the count is rounded to the chosen unit).
 */
export function relativeTimeSince(iso: string, now: number = Date.now()): RelativeTime | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.max(0, Math.floor((now - then) / MS_PER_DAY));
  if (days === 0) return { unit: 'today' };
  if (days < 14) return { unit: 'day', count: days };
  if (days < 60) return { unit: 'week', count: Math.round(days / 7) };
  if (days < 365) return { unit: 'month', count: Math.round(days / 30) };
  return { unit: 'year', count: Math.round(days / 365) };
}
