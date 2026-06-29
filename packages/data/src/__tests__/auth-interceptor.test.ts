import { configureAuthInterceptor } from '../client';
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
