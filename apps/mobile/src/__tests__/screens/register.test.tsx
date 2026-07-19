import AsyncStorage from '@react-native-async-storage/async-storage';
import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import type { ReactTestInstance } from 'react-test-renderer';

import RegisterScreen from '@/app/auth/register';
import { signOut } from '@/hooks/use-auth';
import { StorageKeys } from '@/lib/storage';

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  await i18n.changeLanguage(language);
  const view = await render(
    <I18nextProvider i18n={i18n}>
      <RegisterScreen />
    </I18nextProvider>,
  );
  return { i18n, ...view };
}

// One interaction per act() scope — see the note in login.test.tsx.
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

describe('RegisterScreen', () => {
  it('shows required-field errors and does not register when submitted empty', async () => {
    const { getByText, getByTestId } = await renderScreen('en');

    await tap(getByTestId('auth-submit'));

    expect(getByText('Please enter your name.')).toBeTruthy();
    expect(getByText('Please enter your email.')).toBeTruthy();
    expect(getByText('Please enter your password.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(await storedSession()).toBeNull();
  });

  it('enforces a minimum password length', async () => {
    const { getByText, getByTestId, getByPlaceholderText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('Your name'), 'Alice Smith');
    await typeInto(getByPlaceholderText('you@example.com'), 'alice@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'short');
    await tap(getByTestId('auth-submit'));

    expect(getByText('Password must be at least 8 characters.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('registers with a valid name/email/password and returns to the previous screen', async () => {
    const { getByTestId, getByPlaceholderText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('Your name'), 'Alice Smith');
    await typeInto(getByPlaceholderText('you@example.com'), 'alice@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'longenough');
    await tap(getByTestId('auth-submit'));

    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(await storedSession()).toEqual({
      name: 'Alice Smith',
      email: 'alice@example.com',
      provider: 'password',
    });
  });

  it('registers via the OAuth provider button and lands on the success view', async () => {
    const { getByTestId, getByText } = await renderScreen('en');

    await tap(getByTestId('oauth-button'));

    // Success is an in-place landing view; navigation waits for Continue.
    expect(getByText("You're signed in and ready to go.")).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
    const session = await storedSession();
    expect(session?.email).toMatch(/gmail\.com/);

    await tap(getByTestId('auth-continue'));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });

  it('cross-links to the login screen', async () => {
    const { getByText } = await renderScreen('en');

    await tap(getByText('Log in'));

    expect(router.replace).toHaveBeenCalledWith('/auth/login');
  });

  it('shows the exact backend message under the password field for a too-similar password', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      registerWithEmail: jest.fn().mockResolvedValue({
        ok: false,
        code: 'generic',
        fieldErrors: [
          {
            message: 'The password is too similar to the first name.',
            code: 'password_too_similar',
            param: 'password',
          },
        ],
      }),
      signInWithGoogle: jest.fn(),
    });

    const { getByTestId, getByPlaceholderText, findByText, queryByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('Your name'), 'Ada Lovelace');
    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'adalovelace');
    fireEvent.press(getByTestId('auth-submit'));

    // The password validator has no localized key, so the raw backend message is shown verbatim.
    expect(await findByText('The password is too similar to the first name.')).toBeOnTheScreen();
    // And the generic banner must NOT appear when a structured error exists.
    expect(queryByText('Something went wrong. Please try again.')).toBeNull();
  });

  it('shows the backend message under the name field for a rejected name', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      registerWithEmail: jest.fn().mockResolvedValue({
        ok: false,
        code: 'generic',
        fieldErrors: [
          {
            message: 'Ensure this value has at most 150 characters.',
            code: 'max_length',
            param: 'name',
          },
        ],
      }),
      signInWithGoogle: jest.fn(),
    });

    const { getByTestId, getByPlaceholderText, findByText, queryByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('Your name'), 'Ada Lovelace');
    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'adalovelace');
    fireEvent.press(getByTestId('auth-submit'));

    // The name validator has no localized key, so the raw backend message is shown
    // verbatim — and it must surface under the name field, not as the generic banner.
    expect(await findByText('Ensure this value has at most 150 characters.')).toBeOnTheScreen();
    expect(queryByText('Something went wrong. Please try again.')).toBeNull();
  });

  it('shows the localized email-taken error when registration reports email_taken', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      registerWithEmail: jest.fn().mockResolvedValue({ ok: false, code: 'email_taken' }),
      signInWithGoogle: jest.fn(),
    });

    const { getByText, getByTestId, getByPlaceholderText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('Your name'), 'Ada Lovelace');
    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'sup3rs3cret!');
    await tap(getByTestId('auth-submit'));

    await waitFor(() => expect(getByText('That email is already registered.')).toBeTruthy());
    expect(router.back).not.toHaveBeenCalled();
  });

  it('navigates to verify when registration is pending', async () => {
    const { mockPush } = require('../../../test-setup');
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      registerWithEmail: jest.fn().mockResolvedValue({ ok: 'verifyPending' }),
      signInWithGoogle: jest.fn(),
    });

    const { getByTestId, getByPlaceholderText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('Your name'), 'Ada Lovelace');
    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    await typeInto(getByPlaceholderText('Enter your password'), 'sup3rs3cret!');
    await tap(getByTestId('auth-submit'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/verify'));
  });
});
