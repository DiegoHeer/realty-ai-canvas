import { AuthError, login, signup, verifyEmail, refresh } from '../auth-client';

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('auth-client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('login returns the user (with name) and tokens from meta', async () => {
    mockFetch(200, {
      status: 200,
      data: { user: { id: 1, email: 'ada@example.com', name: 'Ada Lovelace', display: 'ada', username: 'ada' } },
      meta: { is_authenticated: true, access_token: 'AT', refresh_token: 'RT' },
    });
    const session = await login({ email: 'ada@example.com', password: 'pw' });
    expect(session.user.name).toBe('Ada Lovelace');
    expect(session.tokens).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
  });

  it('signup returns verifyPending with the session token on a 401 verify_email flow', async () => {
    mockFetch(401, {
      status: 401,
      data: { flows: [{ id: 'login' }, { id: 'verify_email', is_pending: true }] },
      meta: { is_authenticated: false, session_token: 'ST' },
    });
    const result = await signup({ email: 'ada@example.com', name: 'Ada', password: 'pw' });
    expect(result).toEqual({ kind: 'verifyPending', sessionToken: 'ST' });
  });

  it('login throws AuthError on invalid credentials (400/401 without verify flow)', async () => {
    mockFetch(400, { status: 400, errors: [{ message: 'Invalid credentials.' }] });
    await expect(login({ email: 'x@y.z', password: 'bad' })).rejects.toBeInstanceOf(AuthError);
  });

  it('verifyEmail sends the code + session token and returns an authenticated session', async () => {
    mockFetch(200, {
      status: 200,
      data: { user: { id: 1, email: 'ada@example.com', name: 'Ada Lovelace' } },
      meta: { is_authenticated: true, access_token: 'AT2', refresh_token: 'RT2' },
    });
    const session = await verifyEmail({ code: '123456', sessionToken: 'ST' });
    expect(session.tokens.accessToken).toBe('AT2');
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[1].headers['X-Session-Token']).toBe('ST');
  });

  it('refresh returns new tokens from data (tokens come back in data, not meta)', async () => {
    mockFetch(200, {
      status: 200,
      data: { access_token: 'AT2', refresh_token: 'RT2' },
    });
    const tokens = await refresh('RT');
    expect(tokens).toEqual({ accessToken: 'AT2', refreshToken: 'RT2' });
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toMatch(/\/tokens\/refresh$/);
  });
});
