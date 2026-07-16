import { withUtmParams } from '@/lib/analytics/utm';

describe('withUtmParams', () => {
  it.each([
    ['https://funda.nl/koop/den-haag/huis-1/', 'https://funda.nl/koop/den-haag/huis-1/?utm_source=huismusapp.com&utm_medium=referral'],
    ['https://funda.nl/detail?foo=bar', 'https://funda.nl/detail?foo=bar&utm_source=huismusapp.com&utm_medium=referral'],
    ['https://funda.nl/detail?', 'https://funda.nl/detail?utm_source=huismusapp.com&utm_medium=referral'],
    ['https://funda.nl/detail#section', 'https://funda.nl/detail?utm_source=huismusapp.com&utm_medium=referral#section'],
    ['https://funda.nl/detail?foo=bar#section', 'https://funda.nl/detail?foo=bar&utm_source=huismusapp.com&utm_medium=referral#section'],
  ])('%s -> %s', (input, expected) => {
    expect(withUtmParams(input)).toBe(expected);
  });
});
