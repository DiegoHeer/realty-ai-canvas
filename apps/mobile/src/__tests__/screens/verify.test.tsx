import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import type { ReactTestInstance } from 'react-test-renderer';

import VerifyScreen from '@/app/auth/verify';
import { signOut } from '@/hooks/use-auth';

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  await i18n.changeLanguage(language);
  const view = await render(
    <I18nextProvider i18n={i18n}>
      <VerifyScreen />
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

beforeEach(async () => {
  jest.clearAllMocks();
  await signOut();
});

afterEach(() => jest.restoreAllMocks());

describe('VerifyScreen', () => {
  it('shows a required-field error when submitted empty', async () => {
    const { getByText, getByTestId } = await renderScreen('en');

    await tap(getByTestId('auth-submit'));

    expect(getByText('Please enter the code.')).toBeTruthy();
    expect(router.dismissAll).not.toHaveBeenCalled();
  });

  it('verifies the code and dismisses the auth stack on success', async () => {
    const { mockDismissAll } = require('../../../test-setup');
    const verifyEmail = jest.fn().mockResolvedValue({ ok: true });
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({ verifyEmail });

    const { getByTestId, getByPlaceholderText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('6-digit code'), '123456');
    await tap(getByTestId('auth-submit'));

    await waitFor(() => expect(verifyEmail).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
  });

  it('shows a localized error for an invalid code', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      verifyEmail: jest.fn().mockResolvedValue({ ok: false, code: 'invalid_code' }),
    });

    const { getByTestId, getByPlaceholderText, findByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('6-digit code'), '000000');
    fireEvent.press(getByTestId('auth-submit'));

    expect(await findByText('That code is invalid or expired.')).toBeOnTheScreen();
  });

  it('renders the invalid-key error from structured field errors under the code field', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      verifyEmail: jest.fn().mockResolvedValue({
        ok: false,
        code: 'invalid_code',
        fieldErrors: [{ message: 'Invalid or expired key.', code: 'invalid', param: 'key' }],
      }),
    });

    const { getByTestId, getByPlaceholderText, findByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('6-digit code'), '000000');
    fireEvent.press(getByTestId('auth-submit'));

    // code "invalid" on the "key" param resolves to the localized code-invalid copy.
    expect(await findByText('That code is invalid or expired.')).toBeOnTheScreen();
  });
});
