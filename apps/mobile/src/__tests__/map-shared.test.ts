import type { Listing } from '@realty/types';

import { priceLabel } from '@/components/map-shared';

// priceLabel only reads `price` and `currency`, so a minimal fixture suffices.
function listing(price: number, currency = 'EUR'): Listing {
  return { price, currency } as Listing;
}

describe('priceLabel', () => {
  it('formats thousands below €1M with a "k" suffix', () => {
    expect(priceLabel(listing(450_000))).toBe('€450k');
    expect(priceLabel(listing(675_000))).toBe('€675k');
    expect(priceLabel(listing(999_000))).toBe('€999k');
  });

  it('switches to millions once the value reaches €1M', () => {
    expect(priceLabel(listing(1_252_000))).toBe('€1.25M');
    expect(priceLabel(listing(2_150_000))).toBe('€2.15M');
  });

  it('shows €1M (not "1000k") at the boundary and drops trailing zeros', () => {
    expect(priceLabel(listing(1_000_000))).toBe('€1M');
    expect(priceLabel(listing(1_500_000))).toBe('€1.5M');
    expect(priceLabel(listing(1_050_000))).toBe('€1.05M');
  });

  it('treats prices that round up to 1000k as millions', () => {
    // Math.round(999_600 / 1000) === 1000, so this would read "1000k" — show "€1M".
    expect(priceLabel(listing(999_600))).toBe('€1M');
  });

  it('omits the € prefix for non-EUR currencies', () => {
    expect(priceLabel(listing(675_000, 'USD'))).toBe('675k');
    expect(priceLabel(listing(1_250_000, 'USD'))).toBe('1.25M');
  });

  it('falls back to the raw price below €1k', () => {
    expect(priceLabel(listing(450))).toBe('450');
  });
});
