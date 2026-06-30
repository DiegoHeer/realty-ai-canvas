import { coalescedRefresh, configureAuthInterceptor } from '../client';
import { getListings } from '../client';

// USE_LISTING_MOCKS is true only when API_URL === ''. Force a real fetch path.
jest.mock('../env', () => ({
  ...jest.requireActual('../env'),
  API_BASE: 'https://api.test',
  API_URL: 'https://api.test',
  USE_LISTING_MOCKS: false,
  USE_MOCKS: false,
}));

function okJson(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}

describe('request() Bearer injection', () => {
  afterEach(() => {
    configureAuthInterceptor(null);
    jest.restoreAllMocks();
  });

  it('attaches Authorization when a token is available', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson([]));
    global.fetch = fetchMock as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'AT', refresh: async () => null });

    await getListings();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer AT');
  });

  it('omits Authorization when no interceptor is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okJson([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await getListings();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('request() 401 refresh-retry', () => {
  afterEach(() => {
    configureAuthInterceptor(null);
    jest.restoreAllMocks();
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) })
      .mockResolvedValueOnce(okJson([]));
    global.fetch = fetchMock as unknown as typeof fetch;
    const refresh = jest.fn().mockResolvedValue('NEW');
    configureAuthInterceptor({ getAccessToken: () => 'OLD', refresh });

    await getListings();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer NEW');
  });

  it('coalesces concurrent 401s into a single refresh (single-flight)', async () => {
    const fetchMock = jest.fn().mockImplementation((_url, opts) => {
      const auth = (opts.headers as Record<string, string>).Authorization;
      return Promise.resolve(
        auth === 'Bearer NEW'
          ? okJson([])
          : { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) },
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    let current = 'OLD';
    const refresh = jest.fn().mockImplementation(async () => {
      current = 'NEW';
      return current;
    });
    configureAuthInterceptor({ getAccessToken: () => current, refresh });

    await Promise.all([getListings(), getListings()]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('throws when refresh fails (returns null)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) }) as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'OLD', refresh: async () => null });

    await expect(getListings()).rejects.toThrow();
  });

  it('coalescedRefresh joins the interceptor single-flight (one refresh for a concurrent 401 + boot refresh)', async () => {
    // The boot-hydration refresh must share the interceptor's in-flight promise:
    // otherwise a /v1 401 and the hydrate refresh both consume the rotating
    // refresh token and the second rejects, signing out a healthy session.
    let resolveRefresh!: (token: string) => void;
    const refresh = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveRefresh = resolve; }),
    );
    const fetchMock = jest.fn().mockImplementation((_url, opts) => {
      const auth = (opts.headers as Record<string, string>).Authorization;
      return Promise.resolve(
        auth === 'Bearer NEW'
          ? okJson([])
          : { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) },
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'OLD', refresh });

    const requestPromise = getListings(); // 401 → refreshOnce()
    const bootPromise = coalescedRefresh(); // joins the same in-flight refresh
    resolveRefresh('NEW');
    await Promise.all([requestPromise, bootPromise]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
