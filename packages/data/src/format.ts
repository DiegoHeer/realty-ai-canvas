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
