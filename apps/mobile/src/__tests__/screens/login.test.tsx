import AsyncStorage from '@react-native-async-storage/async-storage';
import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import type { ReactTestInstance } from 'react-test-renderer';

import LoginScreen from '@/app/auth/login';
import { signOut } from '@/hooks/use-auth';
import { StorageKeys } from '@/lib/storage';
import { mockCanGoBack, mockExchangeCodeAsync, mockPromptAsync } from '../../../test-setup';

// Default: AUTH_ENABLED=false so mock-mode tests work with social buttons visible.
// Real-mode tests use jest.replaceProperty (same pattern as use-auth.test.ts) to
// override AUTH_ENABLED on the plain module object without reloading modules.
jest.mock('@realty/data', () => {
  const actual = jest.requireActual('@realty/data');
  return { ...actual, AUTH_ENABLED: false };
});

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  // Apply the language before rendering so assertions see the localized copy
  // (i18next's changeLanguage is async).
  await i18n.changeLanguage(language);
  const view = await render(
    <I18nextProvider i18n={i18n}>
      <LoginScreen />
    </I18nextProvider>,
  );
  return { i18n, ...view };
}

// React 19 + RNTL flush each interaction's re-render only when it has its own
// settled act() scope; batching several fireEvents in one scope would let a
// later press read pre-update state. So wrap one interaction per act().
async function typeInto(input: ReactTestInstance, text: string) {
  await act(async () => {
    fireEvent.changeText(input, text);
  });
}

async function tap(element: ReactTestInstance) {
  await act(async () => {
    fireEvent.press(element);
  });
}

async function storedSession() {
  const raw = await AsyncStorage.getItem(StorageKeys.session);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  signOut();
});

describe('LoginScreen', () => {
  it('shows required-field errors and does not sign in when submitted empty', async () => {
    const { getByText, getByTestId } = await renderScreen('en');

    await tap(getByTestId('auth-submit'));

    expect(getByText('Please enter your email.')).toBeTruthy();
    expect(getByText('Please enter your password.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(await storedSession()).toBeNull();
  });

  it('rejects a malformed email', async () => {
    const { getByText, getByTestId, getByPlaceholderText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('you@example.com'), 'not-an-email');
    await typeInto(getByPlaceholderText('Enter your password'), 'secret123');
    await tap(getByTestId('auth-submit'));

    expect(getByText('Please enter a valid email address.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('signs in with a valid email/password and returns to the previous screen', async () => {
    const { getByTestId, getByPlaceholderText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('you@example.com'), 'jane.doe@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'secret123');
    await tap(getByTestId('auth-submit'));

    // The pop is deferred to the next frame (see LoginScreen), so back is async.
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    // Name is derived from the email local-part by the mock store.
    expect(await storedSession()).toEqual({ name: 'Jane Doe', email: 'jane.doe@example.com' });
  });

  it('signs in via the OAuth provider button and lands on the success view', async () => {
    const { getByTestId, getByText } = await renderScreen('en');

    await tap(getByTestId('oauth-button'));

    // Success is an in-place landing view; navigation waits for Continue.
    expect(getByText("You're signed in and ready to go.")).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
    const session = await storedSession();
    expect(session?.email).toMatch(/gmail\.com|appleid\.com/);

    await tap(getByTestId('auth-continue'));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });

  it('lands on the profile tab after sign-in when there is no history to pop (web deep link)', async () => {
    // Opened directly by URL: router.back() would no-op and strand the user on
    // the stale form, so Continue must replace to /profile instead.
    mockCanGoBack.mockReturnValueOnce(false);
    const { getByTestId } = await renderScreen('en');

    await tap(getByTestId('oauth-button'));
    await tap(getByTestId('auth-continue'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/profile'));
    expect(router.back).not.toHaveBeenCalled();
  });

  it('cross-links to the register screen', async () => {
    const { getByText } = await renderScreen('en');

    await tap(getByText('Sign up'));

    expect(router.replace).toHaveBeenCalledWith('/auth/register');
  });

  it('navigates to the forgot-password screen, carrying the typed email', async () => {
    const { getByText, getByPlaceholderText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    await tap(getByText('Forgot password?'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/auth/forgot-password',
      params: { email: 'ada@example.com' },
    });
  });

  it('navigates to forgot-password without a param when the email is blank', async () => {
    const { getByText } = await renderScreen('en');

    await tap(getByText('Forgot password?'));

    expect(router.push).toHaveBeenCalledWith('/auth/forgot-password');
  });

  it('localizes its copy (Dutch)', async () => {
    const { getAllByText } = await renderScreen('nl');
    // Title and CTA both read "Inloggen".
    expect(getAllByText('Inloggen').length).toBeGreaterThan(0);
  });

  it('shows a localized server error when sign-in fails', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      signInWithEmail: jest.fn().mockResolvedValue({ ok: false, code: 'invalid_credentials' }),
      signInWithGoogle: jest.fn(),
      signInWithApple: jest.fn(),
    });
    const { getByPlaceholderText, getByTestId, findByText } = await renderScreen('en');
    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'bad');
    fireEvent.press(getByTestId('auth-submit'));
    expect(await findByText('Invalid email or password.')).toBeOnTheScreen();
  });

  it('renders the backend mismatch message from structured field errors', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      signInWithEmail: jest.fn().mockResolvedValue({
        ok: false,
        code: 'invalid_credentials',
        fieldErrors: [
          {
            message: 'The email address and/or password you specified are not correct.',
            code: 'email_password_mismatch',
            param: 'password',
          },
        ],
      }),
      signInWithGoogle: jest.fn(),
      signInWithApple: jest.fn(),
    });
    const { getByPlaceholderText, getByTestId, findByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'bad');
    fireEvent.press(getByTestId('auth-submit'));

    // email_password_mismatch is a known code → localized copy, shown by the field.
    expect(await findByText('Invalid email or password.')).toBeOnTheScreen();
  });

  it('hides the social button in real-auth mode while Google is not configured', async () => {
    // Babel compiles named imports as live property reads (_data.AUTH_ENABLED),
    // so updating the plain mock object is seen by the component at render time
    // without needing to reload modules (which would break React context).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const authData = require('@realty/data');
    jest.replaceProperty(authData, 'AUTH_ENABLED', true);

    const { queryByTestId } = await renderScreen('en');
    expect(queryByTestId('oauth-button')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Real-auth mode with Google configured: the button is live and drives the
// token flow end to end (mocked expo-auth-session browser round-trip → real
// use-auth store → mocked allauth provider-token call).
// ---------------------------------------------------------------------------

describe('LoginScreen (real mode, Google configured)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const authData = require('@realty/data');

  beforeEach(() => {
    // Earlier tests spy on useAuth and never restore (the file relies on spies
    // simply being re-created); drop them so this block hits the real store.
    jest.restoreAllMocks();
    jest.replaceProperty(authData, 'AUTH_ENABLED', true);
    // jest-expo runs as iOS, so google-auth selects the iOS client id.
    jest.replaceProperty(authData, 'GOOGLE_IOS_CLIENT_ID', '1-n.apps.googleusercontent.com');
  });

  afterEach(async () => {
    // Restore AUTH_ENABLED=false first so signOut() clears the mock store.
    jest.restoreAllMocks();
    await act(async () => {
      await signOut();
    });
  });

  it('signs in with Google, shows the success landing, and continues back', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'success', params: { code: 'AUTH_CODE' } });
    mockExchangeCodeAsync.mockResolvedValue({ idToken: 'IDT' });
    jest.spyOn(authData, 'providerTokenLogin').mockResolvedValue({
      user: { id: 1, email: 'ada@gmail.com', name: 'Ada Lovelace' },
      tokens: { accessToken: 'AT', refreshToken: 'RT' },
    });

    const { getByTestId, getByText } = await renderScreen('en');
    await tap(getByTestId('oauth-button'));

    expect(getByText('Login successful')).toBeOnTheScreen();
    expect(authData.providerTokenLogin).toHaveBeenCalledWith({
      provider: 'google',
      clientId: '1-n.apps.googleusercontent.com',
      idToken: 'IDT',
    });
    expect(await storedSession()).toEqual({ name: 'Ada Lovelace', email: 'ada@gmail.com' });

    await tap(getByTestId('auth-continue'));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });

  it('shows the cancelled message when the browser sheet is dismissed', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'dismiss' });

    const { getByTestId, findByText } = await renderScreen('en');
    await tap(getByTestId('oauth-button'));

    expect(await findByText('Sign-in was cancelled.')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
    expect(await storedSession()).toBeNull();
  });

  it('shows the failure message when the provider round-trip errors', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'error', params: {} });

    const { getByTestId, findByText } = await renderScreen('en');
    await tap(getByTestId('oauth-button'));

    expect(
      await findByText('Could not sign in with this account. Please try again.'),
    ).toBeOnTheScreen();
    expect(await storedSession()).toBeNull();
  });
});
