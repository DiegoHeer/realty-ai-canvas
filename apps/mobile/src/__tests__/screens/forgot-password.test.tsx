import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import type { ReactTestInstance } from 'react-test-renderer';

import ForgotPasswordScreen from '@/app/auth/forgot-password';

import { mockPush } from '../../../test-setup';

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  await i18n.changeLanguage(language);
  const view = await render(
    <I18nextProvider i18n={i18n}>
      <ForgotPasswordScreen />
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

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

afterEach(() => jest.restoreAllMocks());

describe('ForgotPasswordScreen', () => {
  it('shows a required-email error when submitted empty', async () => {
    const { getByText, getByTestId } = await renderScreen('en');

    await tap(getByTestId('auth-submit'));

    expect(getByText('Please enter your email.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows an invalid-email error for a malformed address', async () => {
    const { getByText, getByPlaceholderText, getByTestId } = await renderScreen('en');

    await typeInto(getByPlaceholderText('you@example.com'), 'not-an-email');
    await tap(getByTestId('auth-submit'));

    expect(getByText('Please enter a valid email address.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('prefills the email from the route param', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ email: 'ada@example.com' });

    const { getByDisplayValue } = await renderScreen('en');

    expect(getByDisplayValue('ada@example.com')).toBeTruthy();
  });

  it('requests a reset code and advances to the reset screen on success', async () => {
    const requestPasswordReset = jest.fn().mockResolvedValue({ ok: true });
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({ requestPasswordReset });

    const { getByPlaceholderText, getByTestId } = await renderScreen('en');

    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    await tap(getByTestId('auth-submit'));

    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith('ada@example.com'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/reset-password'));
  });

  it('surfaces a backend email field error under the field and does not advance', async () => {
    jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({
      requestPasswordReset: jest.fn().mockResolvedValue({
        ok: false,
        code: 'generic',
        fieldErrors: [{ message: 'Enter a valid email address.', code: 'invalid', param: 'email' }],
      }),
    });

    const { getByPlaceholderText, getByTestId, findByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('you@example.com'), 'ada@example.com');
    fireEvent.press(getByTestId('auth-submit'));

    expect(await findByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
