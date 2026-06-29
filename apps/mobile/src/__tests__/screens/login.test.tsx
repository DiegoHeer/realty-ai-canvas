import AsyncStorage from '@react-native-async-storage/async-storage';
import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import type { ReactTestInstance } from 'react-test-renderer';

import LoginScreen from '@/app/auth/login';
import { signOut } from '@/hooks/use-auth';
import { StorageKeys } from '@/lib/storage';

// Default: AUTH_ENABLED=false so mock-mode tests work with social buttons visible.
// Real-mode tests use jest.isolateModulesAsync + Object.defineProperty (same as
// use-auth.test.ts) to override AUTH_ENABLED on the plain module object.
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

  it('signs in via the OAuth provider button', async () => {
    const { getByTestId } = await renderScreen('en');

    await tap(getByTestId('oauth-button'));

    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    const session = await storedSession();
    expect(session?.email).toMatch(/gmail\.com|appleid\.com/);
  });

  it('cross-links to the register screen', async () => {
    const { getByText } = await renderScreen('en');

    await tap(getByText('Sign up'));

    expect(router.replace).toHaveBeenCalledWith('/auth/register');
  });

  it('localizes its copy (Dutch)', async () => {
    const { getAllByText } = await renderScreen('nl');
    // Title and CTA both read "Inloggen".
    expect(getAllByText('Inloggen').length).toBeGreaterThan(0);
  });

  it('shows a server error when sign-in fails', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      signInWithEmail: jest.fn().mockResolvedValue({ ok: false, error: 'Invalid email or password.' }),
      signInWithGoogle: jest.fn(),
      signInWithApple: jest.fn(),
    });
    const { getByPlaceholderText, getByTestId, findByText } = await renderScreen('en');
    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'bad');
    fireEvent.press(getByTestId('auth-submit'));
    expect(await findByText('Invalid email or password.')).toBeOnTheScreen();
  });

  it('hides the social button in real-auth mode', async () => {
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
