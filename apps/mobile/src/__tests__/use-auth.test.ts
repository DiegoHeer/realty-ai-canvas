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

import { clearTokens, loadTokens } from '@/lib/secure-tokens';
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
    expect(result.current.user).toEqual({ name: 'John Doe', email: 'john.doe@example.com' });
    await waitFor(async () =>
      expect(await storedSession()).toEqual({ name: 'John Doe', email: 'john.doe@example.com' }),
    );
  });

  it('registers with an explicit name/email, trimming whitespace', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      await result.current.registerWithEmail({ name: '  Alice Smith ', email: 'alice@example.com' });
    });

    expect(result.current.user).toEqual({ name: 'Alice Smith', email: 'alice@example.com' });
  });

  it('establishes provider-specific sessions for Google and Apple', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      result.current.signInWithGoogle();
    });
    expect(result.current.user?.email).toBe('user@gmail.com');

    await act(async () => {
      result.current.signInWithApple();
    });
    expect(result.current.user?.email).toBe('user@privaterelay.appleid.com');
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
});
