import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import type { ReactTestInstance } from 'react-test-renderer';

import ResetPasswordScreen from '@/app/auth/reset-password';

import { mockDismissAll } from '../../../test-setup';

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  await i18n.changeLanguage(language);
  const view = await render(
    <I18nextProvider i18n={i18n}>
      <ResetPasswordScreen />
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

function mockUseAuth(resetPassword: jest.Mock) {
  jest.spyOn(require('@/hooks/use-auth'), 'useAuth').mockReturnValue({ resetPassword });
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('ResetPasswordScreen', () => {
  it('shows required-field errors when submitted empty and does not submit', async () => {
    const resetPassword = jest.fn();
    mockUseAuth(resetPassword);

    const { getByText, getByTestId } = await renderScreen('en');

    await tap(getByTestId('auth-submit'));

    expect(getByText('Please enter the code.')).toBeTruthy();
    expect(getByText('Please enter your password.')).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('rejects a new password shorter than the minimum and does not submit', async () => {
    const resetPassword = jest.fn();
    mockUseAuth(resetPassword);

    const { getByText, getByPlaceholderText, getByTestId } = await renderScreen('en');

    await typeInto(getByPlaceholderText('XXXX-XXXX'), 'ABCDEFGH');
    await typeInto(getByPlaceholderText('Enter a new password'), 'short');
    await tap(getByTestId('auth-submit'));

    expect(getByText('Password must be at least 8 characters.')).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('rejects when the optional confirmation does not match and does not submit', async () => {
    const resetPassword = jest.fn();
    mockUseAuth(resetPassword);

    const { getByText, getByPlaceholderText, getByTestId } = await renderScreen('en');

    await typeInto(getByPlaceholderText('XXXX-XXXX'), 'ABCDEFGH');
    await typeInto(getByPlaceholderText('Enter a new password'), 'newpw1234');
    await typeInto(getByPlaceholderText('Re-enter the new password'), 'different1');
    await tap(getByTestId('auth-submit'));

    expect(getByText("Passwords don't match.")).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('normalizes the code, resets, shows success, then Continue dismisses the stack', async () => {
    const resetPassword = jest.fn().mockResolvedValue({ ok: true });
    mockUseAuth(resetPassword);

    const { getByPlaceholderText, getByTestId, findByText } = await renderScreen('en');

    // Lowercase + a stray dash; the field canonicalizes to ABCD-EFGH as we type.
    await typeInto(getByPlaceholderText('XXXX-XXXX'), 'abcd-efgh');
    await typeInto(getByPlaceholderText('Enter a new password'), 'newpw1234');
    await tap(getByTestId('auth-submit'));

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({ code: 'ABCD-EFGH', password: 'newpw1234' }),
    );

    // Success view replaces the form; the stack is NOT dismissed until Continue.
    expect(await findByText('Password reset')).toBeOnTheScreen();
    expect(mockDismissAll).not.toHaveBeenCalled();

    await tap(getByTestId('auth-continue'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
  });

  it('omitting the confirmation still resets (it is optional)', async () => {
    const resetPassword = jest.fn().mockResolvedValue({ ok: true });
    mockUseAuth(resetPassword);

    const { getByPlaceholderText, getByTestId, findByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('XXXX-XXXX'), 'ABCDEFGH');
    await typeInto(getByPlaceholderText('Enter a new password'), 'newpw1234');
    await tap(getByTestId('auth-submit'));

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({ code: 'ABCD-EFGH', password: 'newpw1234' }),
    );
    expect(await findByText('Password reset')).toBeOnTheScreen();
  });

  it('maps an invalid-code field error under the code field', async () => {
    mockUseAuth(
      jest.fn().mockResolvedValue({
        ok: false,
        code: 'invalid_code',
        fieldErrors: [{ message: 'Invalid or expired key.', code: 'invalid', param: 'key' }],
      }),
    );

    const { getByPlaceholderText, getByTestId, findByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('XXXX-XXXX'), 'ZZZZZZZZ');
    await typeInto(getByPlaceholderText('Enter a new password'), 'newpw1234');
    fireEvent.press(getByTestId('auth-submit'));

    // code "invalid" on the "key" param resolves to the localized code-invalid copy.
    expect(await findByText('That code is invalid or expired.')).toBeOnTheScreen();
  });

  it('maps a password-validator field error under the new-password field', async () => {
    mockUseAuth(
      jest.fn().mockResolvedValue({
        ok: false,
        code: 'invalid_code',
        fieldErrors: [
          { message: 'This password is too common.', code: 'password_too_common', param: 'password' },
        ],
      }),
    );

    const { getByPlaceholderText, getByTestId, findByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('XXXX-XXXX'), 'ABCDEFGH');
    await typeInto(getByPlaceholderText('Enter a new password'), 'password');
    fireEvent.press(getByTestId('auth-submit'));

    // Unmapped password code → the backend's message shows under the password field.
    expect(await findByText('This password is too common.')).toBeOnTheScreen();
  });
});
