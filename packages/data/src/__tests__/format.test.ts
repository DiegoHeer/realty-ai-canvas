import { formatPrice } from '../format';

describe('formatPrice', () => {
  it('formats EUR price in English locale', () => {
    const result = formatPrice(675000, 'EUR', 'en');
    expect(result).toMatch(/€/);
    expect(result).toMatch(/675/);
    expect(result).not.toMatch(/\.\d{2}$/); // no decimal cents
  });

  it('formats EUR price in Dutch locale', () => {
    const result = formatPrice(675000, 'EUR', 'nl');
    expect(result).toMatch(/€/);
    expect(result).toMatch(/675/);
  });

  it('handles zero price', () => {
    const result = formatPrice(0, 'EUR', 'en');
    expect(result).toMatch(/€/);
    expect(result).toMatch(/0/);
  });

  it('formats small rental price without decimals', () => {
    const result = formatPrice(1450, 'EUR', 'en');
    expect(result).toMatch(/1[,.]?450/);
    expect(result).not.toMatch(/\.\d{2}$/);
  });

  it('falls back gracefully when no locale is passed', () => {
    const result = formatPrice(675000, 'EUR');
    expect(result).toMatch(/€/);
    expect(result).toMatch(/675/);
  });
});
