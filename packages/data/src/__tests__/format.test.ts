import { formatPrice, relativeTimeSince } from '../format';

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

describe('relativeTimeSince', () => {
  const now = new Date('2026-06-22T12:00:00Z').getTime();

  it('returns "today" for the same day', () => {
    expect(relativeTimeSince('2026-06-22T08:00:00Z', now)).toEqual({ unit: 'today' });
  });

  it('reports whole days within the first two weeks', () => {
    expect(relativeTimeSince('2026-06-17T12:00:00Z', now)).toEqual({ unit: 'day', count: 5 });
  });

  it('rounds to weeks up to ~2 months (21 days → 3 weeks)', () => {
    expect(relativeTimeSince('2026-06-01T12:00:00Z', now)).toEqual({ unit: 'week', count: 3 });
  });

  it('rounds to months up to a year (~120 days → 4 months)', () => {
    expect(relativeTimeSince('2026-02-22T12:00:00Z', now)).toEqual({ unit: 'month', count: 4 });
  });

  it('rounds to years beyond a year (~2 years)', () => {
    expect(relativeTimeSince('2024-06-22T12:00:00Z', now)).toEqual({ unit: 'year', count: 2 });
  });

  it('clamps future timestamps to "today"', () => {
    expect(relativeTimeSince('2026-07-01T12:00:00Z', now)).toEqual({ unit: 'today' });
  });

  it('returns null for an unparseable timestamp', () => {
    expect(relativeTimeSince('not-a-date', now)).toBeNull();
  });
});
