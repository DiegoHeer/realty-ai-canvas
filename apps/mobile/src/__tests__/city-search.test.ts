import type { CityName } from '@realty/data';

import {
  BIGGEST_CITY_CODES,
  biggestCities,
  cityDisplayName,
  searchCities,
} from '@/lib/city-search';

const CITIES: CityName[] = [
  { code: '0363', name: 'Amsterdam' },
  { code: '0362', name: 'Amstelveen' },
  { code: '0599', name: 'Rotterdam' },
  { code: '0518', name: "'s-Gravenhage" },
  { code: '0796', name: "'s-Hertogenbosch" },
  { code: '0344', name: 'Utrecht' },
  { code: '0772', name: 'Eindhoven' },
];

describe('searchCities', () => {
  it('returns nothing for an empty or whitespace query', () => {
    expect(searchCities('', CITIES)).toEqual([]);
    expect(searchCities('   ', CITIES)).toEqual([]);
  });

  it('ranks a prefix match ahead of other matches', () => {
    const results = searchCities('amst', CITIES);
    // Both Amsterdam and Amstelveen start with "amst"; both should appear.
    const names = results.map((c) => c.name);
    expect(names).toContain('Amsterdam');
    expect(names).toContain('Amstelveen');
    // Alphabetical tiebreak among equal prefix scores puts Amstelveen first.
    expect(names[0]).toBe('Amstelveen');
  });

  it('is case-insensitive', () => {
    expect(searchCities('ROTTERDAM', CITIES)[0]?.name).toBe('Rotterdam');
  });

  it('ignores diacritics and punctuation in the city name', () => {
    // "'s-Gravenhage" → matched by the bare "gravenhage".
    expect(searchCities('gravenhage', CITIES)[0]?.code).toBe('0518');
  });

  it('resolves the colloquial "Den Haag" to \'s-Gravenhage', () => {
    const results = searchCities('den haag', CITIES);
    expect(results[0]?.code).toBe('0518');
  });

  it('resolves "Den Bosch" to \'s-Hertogenbosch', () => {
    const results = searchCities('den bosch', CITIES);
    expect(results[0]?.code).toBe('0796');
  });

  it('honours the result limit', () => {
    expect(searchCities('e', CITIES, 2).length).toBeLessThanOrEqual(2);
  });
});

describe('cityDisplayName', () => {
  it('shows "Den Haag" for the formal \'s-Gravenhage', () => {
    expect(cityDisplayName({ code: '0518', name: "'s-Gravenhage" })).toBe('Den Haag');
  });

  it('returns the city name unchanged when there is no override', () => {
    expect(cityDisplayName({ code: '0363', name: 'Amsterdam' })).toBe('Amsterdam');
  });
});

describe('biggestCities', () => {
  it('resolves the curated codes in size order, skipping any absent from the list', () => {
    const result = biggestCities(CITIES);
    // Only the big cities present in CITIES, in BIGGEST_CITY_CODES order.
    expect(result.map((c) => c.code)).toEqual(['0363', '0599', '0518', '0344', '0772']);
  });

  it('defines exactly ten codes', () => {
    expect(BIGGEST_CITY_CODES).toHaveLength(10);
    expect(new Set(BIGGEST_CITY_CODES).size).toBe(10);
  });
});
