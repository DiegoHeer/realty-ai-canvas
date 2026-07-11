import {
  filtersAppliedEvent,
  hostOf,
  listingFavoritedEvent,
  loginEvent,
  onboardingCompletedEvent,
  onboardingStepPath,
  outboundLinkEvent,
  searchEvent,
  signupEvent,
} from '@/lib/analytics/events';

describe('hostOf', () => {
  it.each([
    ['https://www.funda.nl/koop/amsterdam/huis-123/', 'funda.nl'],
    ['https://funda.nl/detail', 'funda.nl'],
    ['http://make.example.com:8080/x?y=1', 'make.example.com'],
    ['https://user:pass@broker.nl/listing', 'broker.nl'],
    ['not a url', ''],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(hostOf(input)).toBe(expected);
  });
});

describe('event builders', () => {
  it('outboundLinkEvent carries host, source name and position, attributed to the listing page', () => {
    expect(outboundLinkEvent('https://www.funda.nl/koop/x', 'Funda', 1)).toEqual({
      name: 'Outbound Link',
      opts: { path: '/listing/:id', props: { host: 'funda.nl', source_name: 'Funda', position: 1 } },
    });
  });

  it('signup/login carry the auth method and their own screen path', () => {
    expect(signupEvent('google')).toEqual({
      name: 'Signup',
      opts: { path: '/auth/register', props: { method: 'google' } },
    });
    expect(loginEvent('email')).toEqual({
      name: 'Login',
      opts: { path: '/auth/login', props: { method: 'email' } },
    });
  });

  it('onboardingCompletedEvent carries the skipped flag and a cities COUNT (never which cities)', () => {
    expect(onboardingCompletedEvent({ skipped: false, citiesSelected: 3 })).toEqual({
      name: 'Onboarding Completed',
      opts: { path: '/onboarding', props: { skipped: false, cities_selected: 3 } },
    });
  });

  it('searchEvent carries the result TYPE and method, never the query text', () => {
    expect(searchEvent('gemeente', 'typed')).toEqual({
      name: 'Search',
      opts: { props: { result_type: 'gemeente', method: 'typed' } },
    });
  });

  it('filtersAppliedEvent carries only the active-filter COUNT (no facet values)', () => {
    expect(filtersAppliedEvent(4)).toEqual({
      name: 'Filters Applied',
      opts: { path: '/settings/filters', props: { active_filter_count: 4 } },
    });
  });

  it('listingFavoritedEvent has no properties', () => {
    expect(listingFavoritedEvent()).toEqual({ name: 'Listing Favorited' });
  });
});

describe('onboardingStepPath', () => {
  it.each([
    [0, '/onboarding/welcome'],
    [2, '/onboarding/filters'],
    [3, '/onboarding/cities'],
    [4, '/onboarding/account'],
  ])('index %i -> %s', (index, expected) => {
    expect(onboardingStepPath(index)).toBe(expected);
  });

  it('returns null outside the step range', () => {
    expect(onboardingStepPath(5)).toBeNull();
    expect(onboardingStepPath(-1)).toBeNull();
  });
});

// A privacy guardrail as a test: every property a builder emits must be a
// feature identifier or an aggregate count — never a raw user search value
// (place name, price, chosen filter). Asserted against a key allowlist so a
// future edit that leaks e.g. a city name into props fails here.
describe('privacy: event props stay feature identifiers / counts only', () => {
  const ALLOWED_PROP_KEYS = new Set([
    'host',
    'source_name',
    'position',
    'method',
    'skipped',
    'cities_selected',
    'result_type',
    'active_filter_count',
  ]);
  const specs = [
    outboundLinkEvent('https://funda.nl/x', 'Funda', 1),
    signupEvent('email'),
    loginEvent('google'),
    onboardingCompletedEvent({ skipped: true, citiesSelected: 0 }),
    searchEvent('buurt', 'recent'),
    filtersAppliedEvent(0),
    listingFavoritedEvent(),
  ];

  it('every emitted prop key is on the allowlist', () => {
    for (const spec of specs) {
      for (const key of Object.keys(spec.opts?.props ?? {})) {
        expect(ALLOWED_PROP_KEYS.has(key)).toBe(true);
      }
    }
  });
});
