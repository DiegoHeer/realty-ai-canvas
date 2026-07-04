/**
 * lib/google-auth tests: the browser OAuth round-trip that produces a Google
 * id_token for allauth's provider-token flow. expo-auth-session is mocked in
 * test-setup.ts — `mockPromptAsync` scripts the browser outcome and
 * `mockAuthRequests` records each constructed request's OAuth params.
 */
import { Platform } from 'react-native';

import {
  mockAuthRequests,
  mockExchangeCodeAsync,
  mockPromptAsync,
} from '../../test-setup';

// Client ids ('' by default) come from @realty/data; the file-level mock makes
// them plain writable properties so jest.replaceProperty works (the real
// module's re-exports compile to non-configurable getters).
jest.mock('@realty/data', () => {
  const actual = jest.requireActual('@realty/data');
  return {
    ...actual,
    GOOGLE_WEB_CLIENT_ID: '',
    GOOGLE_ANDROID_CLIENT_ID: '',
    GOOGLE_IOS_CLIENT_ID: '',
  };
});

import {
  googleClientId,
  isGoogleSignInAvailable,
  requestGoogleIdToken,
} from '@/lib/google-auth';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const authData = require('@realty/data');

const ANDROID_CLIENT_ID = '1234-android.apps.googleusercontent.com';
const IOS_CLIENT_ID = '1234-ios.apps.googleusercontent.com';
const WEB_CLIENT_ID = '1234-web.apps.googleusercontent.com';

/** Pin Platform.OS for one test (jest-expo defaults to ios). */
function onPlatform(os: 'web' | 'android' | 'ios') {
  jest.replaceProperty(Platform, 'OS', os);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthRequests.length = 0;
});

afterEach(() => jest.restoreAllMocks());

describe('availability gating', () => {
  it('is unavailable (and fails fast) when no client id is configured', async () => {
    expect(isGoogleSignInAvailable()).toBe(false);
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed' });
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });

  it("selects the platform's client id (web / android / ios)", () => {
    jest.replaceProperty(authData, 'GOOGLE_WEB_CLIENT_ID', WEB_CLIENT_ID);
    jest.replaceProperty(authData, 'GOOGLE_ANDROID_CLIENT_ID', ANDROID_CLIENT_ID);
    jest.replaceProperty(authData, 'GOOGLE_IOS_CLIENT_ID', IOS_CLIENT_ID);
    onPlatform('android');
    expect(googleClientId()).toBe(ANDROID_CLIENT_ID);
    onPlatform('ios');
    expect(googleClientId()).toBe(IOS_CLIENT_ID);
    onPlatform('web');
    expect(googleClientId()).toBe(WEB_CLIENT_ID);
  });
});

describe('web (implicit id_token flow)', () => {
  beforeEach(() => {
    jest.replaceProperty(authData, 'GOOGLE_WEB_CLIENT_ID', WEB_CLIENT_ID);
    onPlatform('web');
  });

  it('builds an OIDC implicit request (id_token + nonce, no PKCE) to /auth/callback', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'success', params: { id_token: 'IDT' } });

    const result = await requestGoogleIdToken();

    expect(result).toEqual({ kind: 'success', idToken: 'IDT', clientId: WEB_CLIENT_ID });
    expect(mockAuthRequests).toHaveLength(1);
    expect(mockAuthRequests[0]!.config).toMatchObject({
      clientId: WEB_CLIENT_ID,
      redirectUri: 'https://app.test/auth/callback',
      responseType: 'id_token',
      usePKCE: false,
      scopes: ['openid', 'email', 'profile'],
      extraParams: { nonce: 'test-nonce' },
    });
  });

  it('reports cancel/dismiss as cancelled', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'cancel' });
    expect(await requestGoogleIdToken()).toEqual({ kind: 'cancelled' });
    mockPromptAsync.mockResolvedValue({ type: 'dismiss' });
    expect(await requestGoogleIdToken()).toEqual({ kind: 'cancelled' });
  });

  it('reports an error result, a success without id_token, and a throw as failed', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'error', params: {} });
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed' });
    mockPromptAsync.mockResolvedValue({ type: 'success', params: {} });
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed' });
    mockPromptAsync.mockRejectedValue(new Error('browser exploded'));
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed' });
  });
});

describe('native (code + PKCE flow)', () => {
  beforeEach(() => {
    jest.replaceProperty(authData, 'GOOGLE_ANDROID_CLIENT_ID', ANDROID_CLIENT_ID);
    onPlatform('android');
  });

  it('exchanges the code (with the PKCE verifier) at the reversed-client-id redirect', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'success', params: { code: 'AUTH_CODE' } });
    mockExchangeCodeAsync.mockResolvedValue({ idToken: 'IDT' });

    const result = await requestGoogleIdToken();

    expect(result).toEqual({ kind: 'success', idToken: 'IDT', clientId: ANDROID_CLIENT_ID });
    const expectedRedirect = 'com.googleusercontent.apps.1234-android:/oauthredirect';
    expect(mockAuthRequests[0]!.config).toMatchObject({
      clientId: ANDROID_CLIENT_ID,
      redirectUri: expectedRedirect,
      responseType: 'code',
    });
    expect(mockExchangeCodeAsync).toHaveBeenCalledWith(
      {
        clientId: ANDROID_CLIENT_ID,
        code: 'AUTH_CODE',
        redirectUri: expectedRedirect,
        extraParams: { code_verifier: 'test-code-verifier' },
      },
      expect.objectContaining({ tokenEndpoint: 'https://oauth2.googleapis.com/token' }),
    );
  });

  it('reports cancelled without attempting the code exchange', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'dismiss' });
    expect(await requestGoogleIdToken()).toEqual({ kind: 'cancelled' });
    expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
  });

  it('reports failed when the exchange yields no id_token or throws', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'success', params: { code: 'AUTH_CODE' } });
    mockExchangeCodeAsync.mockResolvedValue({ accessToken: 'AT-only' });
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed' });
    mockExchangeCodeAsync.mockRejectedValue(new Error('exchange down'));
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed' });
  });
});
