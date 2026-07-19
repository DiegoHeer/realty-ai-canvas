/**
 * use-auth store tests
 *
 * The file-level jest.mock sets AUTH_ENABLED=false so mock-mode tests run with
 * the default import of renderHook/act from @testing-library/react-native.
 *
 * Real-mode tests use jest.isolateModules() to load a fresh copy of the hook
 * with AUTH_ENABLED=true and call the exported functions directly (no renderHook
 * needed — getCurrentUser() lets tests assert state without rendering).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { clearPendingReset, clearPendingSession, clearTokens, loadTokens } from '@/lib/secure-tokens';
import { useAuth } from '@/hooks/use-auth';
import { StorageKeys } from '@/lib/storage';

// Default: AUTH_ENABLED=false so mock-mode tests work with the standard imports.
jest.mock('@realty/data', () => {
  const actual = jest.requireActual('@realty/data');
  return { ...actual, AUTH_ENABLED: false };
});

// ---------------------------------------------------------------------------
// Mock-mode tests (AUTH_ENABLED=false — the default / visual-regression path)
// ---------------------------------------------------------------------------

describe('useAuth (mock mode)', () => {
  async function storedSession() {
    const raw = await AsyncStorage.getItem(StorageKeys.session);
    return raw ? JSON.parse(raw) : null;
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    // Sign out via the hook. Module-level currentUser resets across beforeEach
    // because the module state persists within the same test file run — sign out
    // to clear any session left by a previous test.
    const { result } = await renderHook(() => useAuth());
    await act(async () => {
      await result.current.signOut();
    });
  });

  it('starts signed out', async () => {
    const { result } = await renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('signs in with email, deriving a display name, and persists the session', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      await result.current.signInWithEmail('john.doe@example.com');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({ name: 'John Doe', email: 'john.doe@example.com', provider: 'password' });
    await waitFor(async () =>
      expect(await storedSession()).toEqual({ name: 'John Doe', email: 'john.doe@example.com', provider: 'password' }),
    );
  });

  it('registers with an explicit name/email, trimming whitespace', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      await result.current.registerWithEmail({ name: '  Alice Smith ', email: 'alice@example.com' });
    });

    expect(result.current.user).toEqual({
      name: 'Alice Smith',
      email: 'alice@example.com',
      provider: 'password',
    });
  });

  it('establishes a Google session', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      result.current.signInWithGoogle();
    });
    expect(result.current.user?.email).toBe('user@gmail.com');
  });

  it('signs out, clearing the in-memory and persisted session', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      await result.current.signInWithEmail('jane@example.com');
    });
    await waitFor(async () => expect(await storedSession()).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();
    await waitFor(async () => expect(await storedSession()).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Real-mode tests (AUTH_ENABLED=true)
// Uses jest.isolateModules() to load a fresh module instance per test with
// AUTH_ENABLED overridden. Functions are called directly (no renderHook) and
// state is asserted via the exported getCurrentUser() helper.
// ---------------------------------------------------------------------------

describe('use-auth (real mode)', () => {
  afterEach(async () => {
    await clearTokens();
    await clearPendingSession();
    await clearPendingReset();
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('login persists tokens and exposes the user name', async () => {
    await jest.isolateModulesAsync(async () => {
      // In this isolated registry, @realty/data is loaded fresh via the file-level
      // mock factory (AUTH_ENABLED: false). We override AUTH_ENABLED directly on
      // the module object so use-auth's live property access sees true.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      jest.spyOn(authData, 'login').mockResolvedValue({
        user: { id: 1, email: 'ada@example.com', name: 'Ada Lovelace' },
        tokens: { accessToken: 'AT', refreshToken: 'RT' },
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { signInWithEmail, getCurrentUser } = require('@/hooks/use-auth');

      const outcome = await signInWithEmail('ada@example.com', 'pw');

      expect(outcome).toEqual({ ok: true });
      expect(getCurrentUser()).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
      expect(await loadTokens()).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
    });
  });

  it('google sign-in trades the id_token for a session and persists it', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const googleAuth = require('@/lib/google-auth');
      jest
        .spyOn(googleAuth, 'requestGoogleIdToken')
        .mockResolvedValue({ kind: 'success', idToken: 'IDT', clientId: 'WEB_CLIENT_ID' });
      const providerLogin = jest.spyOn(authData, 'providerTokenLogin').mockResolvedValue({
        user: { id: 1, email: 'ada@gmail.com', name: 'Ada Lovelace' },
        tokens: { accessToken: 'AT', refreshToken: 'RT' },
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { signInWithGoogle, getCurrentUser } = require('@/hooks/use-auth');

      const outcome = await signInWithGoogle();

      expect(outcome).toEqual({ ok: true });
      expect(providerLogin).toHaveBeenCalledWith({
        provider: 'google',
        clientId: 'WEB_CLIENT_ID',
        idToken: 'IDT',
      });
      expect(getCurrentUser()).toMatchObject({ name: 'Ada Lovelace', email: 'ada@gmail.com' });
      expect(await loadTokens()).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
    });
  });

  it('google sign-in maps a closed browser sheet to oauth_cancelled without calling the backend', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const googleAuth = require('@/lib/google-auth');
      jest.spyOn(googleAuth, 'requestGoogleIdToken').mockResolvedValue({ kind: 'cancelled' });
      const providerLogin = jest.spyOn(authData, 'providerTokenLogin');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { signInWithGoogle, getCurrentUser } = require('@/hooks/use-auth');

      const outcome = await signInWithGoogle();

      expect(outcome).toEqual({ ok: false, code: 'oauth_cancelled' });
      expect(providerLogin).not.toHaveBeenCalled();
      expect(getCurrentUser()).toBeNull();
    });
  });

  it('google sign-in surfaces oauth_failed for a failed round-trip and a rejected token', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const googleAuth = require('@/lib/google-auth');
      const roundTrip = jest
        .spyOn(googleAuth, 'requestGoogleIdToken')
        .mockResolvedValue({ kind: 'failed' });
      jest
        .spyOn(authData, 'providerTokenLogin')
        .mockRejectedValue(new authData.AuthError('The token is invalid.', 'oauth_failed'));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { signInWithGoogle, getCurrentUser } = require('@/hooks/use-auth');

      // Browser round-trip failed → no backend call is even attempted.
      expect(await signInWithGoogle()).toEqual({ ok: false, code: 'oauth_failed' });

      // Round-trip succeeds but allauth rejects the id_token → same stable code.
      roundTrip.mockResolvedValue({ kind: 'success', idToken: 'BAD', clientId: 'WEB_CLIENT_ID' });
      expect(await signInWithGoogle()).toEqual({ ok: false, code: 'oauth_failed' });
      expect(getCurrentUser()).toBeNull();
    });
  });

  it('register returns verifyPending and does not establish a session', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      jest.spyOn(authData, 'signup').mockResolvedValue({
        kind: 'verifyPending',
        sessionToken: 'ST',
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { registerWithEmail, getCurrentUser } = require('@/hooks/use-auth');

      const outcome = await registerWithEmail({ name: 'Ada', email: 'ada@example.com', password: 'pw' });

      expect(outcome).toEqual({ ok: 'verifyPending' });
      expect(getCurrentUser()).toBeNull();
    });
  });

  it('register surfaces the email_taken code from a coded AuthError', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      jest
        .spyOn(authData, 'signup')
        .mockRejectedValue(new authData.AuthError('That email is already registered.', 'email_taken'));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { registerWithEmail, getCurrentUser } = require('@/hooks/use-auth');

      const outcome = await registerWithEmail({ name: 'Ada', email: 'ada@example.com', password: 'pw' });

      expect(outcome).toEqual({ ok: false, code: 'email_taken' });
      expect(getCurrentUser()).toBeNull();
    });
  });

  it('login surfaces the invalid_credentials code from a coded AuthError', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      jest
        .spyOn(authData, 'login')
        .mockRejectedValue(new authData.AuthError('Invalid email or password.', 'invalid_credentials'));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { signInWithEmail } = require('@/hooks/use-auth');

      const outcome = await signInWithEmail('ada@example.com', 'bad-pw');

      expect(outcome).toEqual({ ok: false, code: 'invalid_credentials' });
    });
  });

  it('login surfaces the structured field errors carried by a coded AuthError', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      const fieldErrors = [
        {
          message: 'The email address and/or password you specified are not correct.',
          code: 'email_password_mismatch',
          param: 'password',
        },
      ];
      jest
        .spyOn(authData, 'login')
        .mockRejectedValue(
          new authData.AuthError('Invalid email or password.', 'invalid_credentials', fieldErrors),
        );
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { signInWithEmail } = require('@/hooks/use-auth');

      const outcome = await signInWithEmail('ada@example.com', 'bad-pw');

      expect(outcome).toEqual({ ok: false, code: 'invalid_credentials', fieldErrors });
    });
  });

  it('login collapses an unexpected (non-coded) failure to the generic code', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      jest.spyOn(authData, 'login').mockRejectedValue(new Error('network down'));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { signInWithEmail } = require('@/hooks/use-auth');

      const outcome = await signInWithEmail('ada@example.com', 'pw');

      expect(outcome).toEqual({ ok: false, code: 'generic' });
    });
  });

  it('hydrate-expired: getSession rejects → refresh succeeds → user populated and tokens rotated', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });

      // Seed keychain tokens so realHydrate proceeds past the early-return.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { saveTokens } = require('@/lib/secure-tokens');
      await saveTokens({ accessToken: 'EXPIRED-AT', refreshToken: 'RT' });

      // Seed persisted session so the cached path runs (coverage of the cache branch).
      await AsyncStorage.setItem(
        StorageKeys.session,
        JSON.stringify({ name: 'Cached User', email: 'cached@example.com' }),
      );

      // getSession rejects once (expired), then resolves after refresh.
      jest
        .spyOn(authData, 'getSession')
        .mockRejectedValueOnce(new Error('401'))
        .mockResolvedValueOnce({ id: 1, email: 'ada@example.com', name: 'Ada Lovelace' });

      // refresh resolves with rotated tokens.
      jest.spyOn(authData, 'refresh').mockResolvedValue({
        accessToken: 'NEW-AT',
        refreshToken: 'NEW-RT',
      });

      // logout is fire-and-forget; stub to avoid noise.
      jest.spyOn(authData, 'logout').mockResolvedValue(undefined);

      // Loading the module triggers boot hydration at module load time.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentUser } = require('@/hooks/use-auth');

      // Let the microtask queue drain so realHydrate's async chain completes.
      await new Promise((resolve) => setImmediate(resolve));

      expect(getCurrentUser()).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
      expect(await loadTokens()).toEqual({ accessToken: 'NEW-AT', refreshToken: 'NEW-RT' });
    });
  });

  it('hydrate-expired: getSession rejects and refresh rejects → session torn down', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });

      // Seed keychain tokens.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { saveTokens } = require('@/lib/secure-tokens');
      await saveTokens({ accessToken: 'EXPIRED-AT', refreshToken: 'RT' });

      // getSession always rejects.
      jest.spyOn(authData, 'getSession').mockRejectedValue(new Error('401'));

      // refresh also rejects → realSignOut will run inside realRefresh.
      jest.spyOn(authData, 'refresh').mockRejectedValue(new Error('refresh failed'));

      // logout is fire-and-forget; stub to avoid noise.
      jest.spyOn(authData, 'logout').mockResolvedValue(undefined);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentUser } = require('@/hooks/use-auth');

      await new Promise((resolve) => setImmediate(resolve));

      expect(getCurrentUser()).toBeNull();
      expect(await loadTokens()).toBeNull();
    });
  });

  it('signOut clears user, tokens and calls queryClient.clear', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });

      jest.spyOn(authData, 'login').mockResolvedValue({
        user: { id: 1, email: 'ada@example.com', name: 'Ada Lovelace' },
        tokens: { accessToken: 'AT', refreshToken: 'RT' },
      });
      jest.spyOn(authData, 'logout').mockResolvedValue(undefined);
      const clearSpy = jest.spyOn(authData.queryClient, 'clear');

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { signInWithEmail, signOut: realSignOut, getCurrentUser } = require('@/hooks/use-auth');

      await signInWithEmail('ada@example.com', 'pw');
      expect(getCurrentUser()).not.toBeNull();
      expect(await loadTokens()).toEqual({ accessToken: 'AT', refreshToken: 'RT' });

      await realSignOut();

      expect(getCurrentUser()).toBeNull();
      expect(await loadTokens()).toBeNull();
      expect(clearSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('register persists the pending session token for cross-restart verification', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      jest.spyOn(authData, 'signup').mockResolvedValue({ kind: 'verifyPending', sessionToken: 'ST-123' });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { registerWithEmail } = require('@/hooks/use-auth');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loadPendingSession } = require('@/lib/secure-tokens');

      const outcome = await registerWithEmail({ name: 'Ada', email: 'ada@example.com', password: 'pw' });

      expect(outcome).toEqual({ ok: 'verifyPending' });
      expect(await loadPendingSession()).toBe('ST-123');
    });
  });

  it('verify recovers the pending session token from storage after eviction', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });

      // Simulate a process restart: token persisted previously, in-memory state empty.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { savePendingSession } = require('@/lib/secure-tokens');
      await savePendingSession('ST-evicted');

      jest.spyOn(authData, 'verifyEmail').mockResolvedValue({
        user: { id: 1, email: 'ada@example.com', name: 'Ada Lovelace' },
        tokens: { accessToken: 'AT', refreshToken: 'RT' },
      });
      jest.spyOn(authData, 'logout').mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifyEmail: doVerify, getCurrentUser } = require('@/hooks/use-auth');

      const outcome = await doVerify('123456');

      expect(outcome).toEqual({ ok: true });
      expect(authData.verifyEmail).toHaveBeenCalledWith({ code: '123456', sessionToken: 'ST-evicted' });
      expect(getCurrentUser()).toMatchObject({ email: 'ada@example.com' });
    });
  });

  it('requestPasswordReset persists the pending reset token', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      jest.spyOn(authData, 'requestPasswordReset').mockResolvedValue({ sessionToken: 'RST-1' });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { requestPasswordReset } = require('@/hooks/use-auth');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loadPendingReset } = require('@/lib/secure-tokens');

      const outcome = await requestPasswordReset('ada@example.com');

      expect(outcome).toEqual({ ok: true });
      expect(authData.requestPasswordReset).toHaveBeenCalledWith({ email: 'ada@example.com' });
      // Both the session token and the email are persisted (the reset needs both).
      expect(await loadPendingReset()).toEqual({ sessionToken: 'RST-1', email: 'ada@example.com' });
    });
  });

  it('resetPassword recovers the token + email, resets, then signs in with the new password', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });

      // Simulate a process restart: token + email persisted previously (during the
      // request step), in-memory state empty.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { savePendingReset } = require('@/lib/secure-tokens');
      await savePendingReset({ sessionToken: 'RST-evicted', email: 'ada@example.com' });

      // Reset-by-code changes the password but does NOT authenticate (resolves void).
      jest.spyOn(authData, 'resetPassword').mockResolvedValue(undefined);
      // The hook then signs in with the new credentials to establish the session.
      jest.spyOn(authData, 'login').mockResolvedValue({
        user: { id: 1, email: 'ada@example.com', name: 'Ada Lovelace' },
        tokens: { accessToken: 'AT', refreshToken: 'RT' },
      });
      jest.spyOn(authData, 'logout').mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resetPassword, getCurrentUser } = require('@/hooks/use-auth');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loadPendingReset } = require('@/lib/secure-tokens');

      const outcome = await resetPassword({ code: 'ABCD-EFGH', password: 'newpw1234' });

      expect(outcome).toEqual({ ok: true });
      // Reset sends just the code + password + session token (no email).
      expect(authData.resetPassword).toHaveBeenCalledWith({
        code: 'ABCD-EFGH',
        password: 'newpw1234',
        sessionToken: 'RST-evicted',
      });
      // Then it logs in with the recovered email + the new password (auto-login).
      expect(authData.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'newpw1234' });
      expect(getCurrentUser()).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
      expect(await loadTokens()).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
      // The pending reset (token + email) is consumed (cleared) on success.
      expect(await loadPendingReset()).toBeNull();
    });
  });

  it('resetPassword fails if the post-reset sign-in fails', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { savePendingReset } = require('@/lib/secure-tokens');
      await savePendingReset({ sessionToken: 'RST', email: 'ada@example.com' });

      jest.spyOn(authData, 'resetPassword').mockResolvedValue(undefined);
      jest
        .spyOn(authData, 'login')
        .mockRejectedValue(new authData.AuthError('Invalid email or password.', 'invalid_credentials'));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resetPassword, getCurrentUser } = require('@/hooks/use-auth');

      const outcome = await resetPassword({ code: 'ABCD-EFGH', password: 'newpw1234' });

      expect(outcome).toEqual({ ok: false, code: 'invalid_credentials' });
      expect(getCurrentUser()).toBeNull();
    });
  });

  it('resetPassword returns generic when there is no pending reset token', async () => {
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authData = require('@realty/data');
      Object.defineProperty(authData, 'AUTH_ENABLED', { value: true, configurable: true });
      const resetSpy = jest.spyOn(authData, 'resetPassword');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resetPassword } = require('@/hooks/use-auth');

      const outcome = await resetPassword({ code: 'ABCD-EFGH', password: 'newpw1234' });

      expect(outcome).toEqual({ ok: false, code: 'generic' });
      expect(resetSpy).not.toHaveBeenCalled();
    });
  });
});
