import type { AnalyticsConfig } from '@/lib/analytics/config';
import {
  buildEventBody,
  sendEvent,
  shouldTrack,
  track,
} from '@/lib/analytics/client';
import { setOptedOut } from '@/lib/analytics/opt-out';
import { segmentsToPattern } from '@/lib/analytics/route-pattern';

describe('segmentsToPattern', () => {
  it.each([
    [['(tabs)'], '/'],
    [['(tabs)', 'explore'], '/explore'],
    [['(tabs)', 'profile'], '/profile'],
    [['listing', '[id]'], '/listing/:id'],
    [['settings', 'privacy'], '/settings/privacy'],
    [['auth', 'register'], '/auth/register'],
    [['onboarding'], '/onboarding'],
  ])('%j -> %s', (segments, expected) => {
    expect(segmentsToPattern(segments as string[])).toBe(expected);
  });
});

describe('buildEventBody', () => {
  it('builds a synthetic url from the site domain and path', () => {
    expect(buildEventBody('realty-ai-canvas', 'pageview', { path: '/listing/:id' })).toEqual({
      name: 'pageview',
      domain: 'realty-ai-canvas',
      url: 'https://realty-ai-canvas/listing/:id',
    });
  });

  it('defaults the path to root and omits empty props', () => {
    const body = buildEventBody('d', 'pageview');
    expect(body.url).toBe('https://d/');
    expect(body.props).toBeUndefined();
  });

  it('includes non-empty props', () => {
    const body = buildEventBody('d', 'search_run', { path: '/', props: { count: 3 } });
    expect(body.props).toEqual({ count: 3 });
  });
});

describe('shouldTrack', () => {
  const on: AnalyticsConfig = { enabled: true, url: 'https://p', domain: 'd' };

  it('is true only when enabled, configured, not web-dev, not opted out, and hydrated', () => {
    expect(shouldTrack(on, false, false, true)).toBe(true);
  });

  it.each([
    ['disabled', { ...on, enabled: false }, false, false, true],
    ['no url', { ...on, url: '' }, false, false, true],
    ['no domain', { ...on, domain: '' }, false, false, true],
    ['web dev', on, true, false, true],
    ['opted out', on, false, true, true],
    ['not hydrated', on, false, false, false],
  ])('is false when %s', (_label, config, webDev, optedOut, hydrated) => {
    expect(shouldTrack(config as AnalyticsConfig, webDev, optedOut, hydrated)).toBe(false);
  });
});

describe('sendEvent', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ status: 202 });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('POSTs the event to <url>/api/event with the right headers and body', () => {
    sendEvent({ enabled: true, url: 'https://p.example', domain: 'd' }, 'pageview', {
      path: '/x',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://p.example/api/event');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['User-Agent']).toMatch(/^Huismus\//);
    expect(JSON.parse(init.body)).toEqual({
      name: 'pageview',
      domain: 'd',
      url: 'https://d/x',
    });
  });
});

describe('track', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ status: 202 });
    global.fetch = fetchMock as unknown as typeof fetch;
    setOptedOut(false);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('is a no-op when analytics is disabled (default in tests)', () => {
    // EXPO_PUBLIC_PLAUSIBLE_ENABLED is unset in the test env, so readConfig()
    // reports disabled and track() must not touch the network.
    track('pageview', { path: '/' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
