import { AuthError, login, parseAllauthErrors, signup, verifyEmail, refresh } from '../auth-client';

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('auth-client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws AuthError when the response body is not JSON (5xx/HTML/empty)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 502,
      ok: false,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    }) as unknown as typeof fetch;
    await expect(login({ email: 'ada@example.com', password: 'pw' })).rejects.toBeInstanceOf(AuthError);
  });

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

  it('signup throws AuthError with code "email_taken" when the email is already registered', async () => {
    // allauth (enumeration prevention off) returns this envelope on a duplicate
    // signup; verified live against django-allauth headless 65.18.
    mockFetch(400, {
      status: 400,
      errors: [
        { message: 'A user is already registered with this email address.', code: 'email_taken', param: 'email' },
      ],
    });
    await expect(signup({ email: 'dup@example.com', name: 'Dup', password: 'pw' })).rejects.toMatchObject({
      name: 'AuthError',
      code: 'email_taken',
    });
  });

  it('login throws AuthError with code "invalid_credentials" on a rejected login', async () => {
    mockFetch(400, { status: 400, errors: [{ message: 'Invalid credentials.' }] });
    await expect(login({ email: 'x@y.z', password: 'bad' })).rejects.toMatchObject({
      name: 'AuthError',
      code: 'invalid_credentials',
    });
  });

  it('login carries the structured field errors (param/code/message) from the 400 body', async () => {
    mockFetch(400, {
      status: 400,
      errors: [
        {
          message: 'The email address and/or password you specified are not correct.',
          code: 'email_password_mismatch',
          param: 'password',
        },
      ],
    });
    await expect(login({ email: 'x@y.z', password: 'bad' })).rejects.toMatchObject({
      name: 'AuthError',
      code: 'invalid_credentials',
      fieldErrors: [
        {
          message: 'The email address and/or password you specified are not correct.',
          code: 'email_password_mismatch',
          param: 'password',
        },
      ],
    });
  });

  it('verifyEmail throws AuthError with code "invalid_code" on a rejected code', async () => {
    mockFetch(400, { status: 400, errors: [{ message: 'Incorrect code.' }] });
    await expect(verifyEmail({ code: '000000', sessionToken: 'ST' })).rejects.toMatchObject({
      name: 'AuthError',
      code: 'invalid_code',
    });
  });

  it('signup carries the password-validator field error from the 400 body', async () => {
    mockFetch(400, {
      status: 400,
      errors: [
        {
          message: 'The password is too similar to the first name.',
          code: 'password_too_similar',
          param: 'password',
        },
      ],
    });
    await expect(
      signup({ email: 'ada@example.com', name: 'Ada', password: 'ada' }),
    ).rejects.toMatchObject({
      name: 'AuthError',
      fieldErrors: [
        { code: 'password_too_similar', param: 'password' },
      ],
    });
  });
});

describe('parseAllauthErrors', () => {
  it('maps each entry to { message, code, param }', () => {
    const parsed = parseAllauthErrors({
      errors: [
        { message: 'Enter a valid email address.', code: 'invalid', param: 'email' },
        { message: 'Invalid or expired key.', code: 'invalid', param: 'key' },
      ],
    });
    expect(parsed).toEqual([
      { message: 'Enter a valid email address.', code: 'invalid', param: 'email' },
      { message: 'Invalid or expired key.', code: 'invalid', param: 'key' },
    ]);
  });

  it('returns [] when there are no errors', () => {
    expect(parseAllauthErrors({})).toEqual([]);
    expect(parseAllauthErrors({ errors: [] })).toEqual([]);
  });

  it('keeps a param-less entry (form-level error) and preserves a missing code', () => {
    const parsed = parseAllauthErrors({ errors: [{ message: 'Something failed.' }] });
    expect(parsed).toEqual([{ message: 'Something failed.', code: undefined, param: undefined }]);
  });

  it('drops a fully empty entry (no message and no code)', () => {
    expect(parseAllauthErrors({ errors: [{ param: 'email' }] })).toEqual([]);
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
