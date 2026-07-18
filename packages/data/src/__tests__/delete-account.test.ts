import { configureAuthInterceptor, deleteAccount, DeleteAccountError } from '../client';

// Point the client at a test API base so deleteAccount() hits our mocked fetch.
jest.mock('../env', () => ({
  ...jest.requireActual('../env'),
  API_BASE: 'https://api.test',
  API_URL: 'https://api.test',
}));

const noContent = () => ({ status: 204, statusText: 'No Content' });
const forbidden = (detail?: string) => ({
  status: 403,
  statusText: 'Forbidden',
  json: async () => (detail === undefined ? {} : { detail }),
});
const unauthorized = () => ({ status: 401, statusText: 'Unauthorized', json: async () => ({}) });

describe('deleteAccount()', () => {
  afterEach(() => {
    configureAuthInterceptor(null);
    jest.restoreAllMocks();
  });

  it('DELETEs /v1/me/account with the Bearer token and password body, resolving on 204', async () => {
    const fetchMock = jest.fn().mockResolvedValue(noContent());
    global.fetch = fetchMock as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'AT', refresh: async () => null });

    await expect(deleteAccount({ password: 'hunter2' })).resolves.toBeUndefined();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/me/account');
    expect(opts.method).toBe('DELETE');
    expect(opts.headers.Authorization).toBe('Bearer AT');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.body).toBe('{"password":"hunter2"}');
  });

  it('sends an empty body (no password) for social re-auth deletions', async () => {
    const fetchMock = jest.fn().mockResolvedValue(noContent());
    global.fetch = fetchMock as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'AT', refresh: async () => null });

    await deleteAccount();

    expect(fetchMock.mock.calls[0][1].body).toBe('{}');
  });

  it('maps a 403 detail to a typed DeleteAccountError code', async () => {
    global.fetch = jest.fn().mockResolvedValue(forbidden('password_incorrect')) as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'AT', refresh: async () => null });

    await expect(deleteAccount({ password: 'wrong' })).rejects.toMatchObject({
      name: 'DeleteAccountError',
      code: 'password_incorrect',
    });
  });

  it('falls back to a generic code for an unrecognized 403 detail', async () => {
    global.fetch = jest.fn().mockResolvedValue(forbidden('something_new')) as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'AT', refresh: async () => null });

    await expect(deleteAccount({ password: 'x' })).rejects.toMatchObject({ code: 'generic' });
  });

  it('treats a real 401 as an expired token: refreshes once and retries', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(noContent());
    global.fetch = fetchMock as unknown as typeof fetch;
    const refresh = jest.fn().mockResolvedValue('NEW');
    configureAuthInterceptor({ getAccessToken: () => 'OLD', refresh });

    await expect(deleteAccount({ password: 'pw' })).resolves.toBeUndefined();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer NEW');
  });

  it('throws when the token refresh fails', async () => {
    global.fetch = jest.fn().mockResolvedValue(unauthorized()) as unknown as typeof fetch;
    configureAuthInterceptor({ getAccessToken: () => 'OLD', refresh: async () => null });

    await expect(deleteAccount({ password: 'pw' })).rejects.toBeInstanceOf(DeleteAccountError);
  });
});
