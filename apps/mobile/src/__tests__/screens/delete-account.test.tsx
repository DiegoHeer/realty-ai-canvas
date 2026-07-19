import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';

import DeleteAccountScreen from '@/app/settings/delete-account';
import type { AuthUser } from '@/hooks/use-auth';

// Factory-mock the hook (rather than an automock) so the real module — which runs
// boot side-effects on import — is never loaded. The screen only reads user,
// deleteAccount and signInWithGoogle, so those are all we provide.
const mockDeleteAccount = jest.fn();
const mockSignInWithGoogle = jest.fn();
let mockUser: AuthUser | null = null;

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: mockUser !== null,
    deleteAccount: mockDeleteAccount,
    signInWithGoogle: mockSignInWithGoogle,
  }),
}));

const PASSWORD_USER: AuthUser = { name: 'Ada', email: 'ada@example.com', provider: 'password' };
const GOOGLE_USER: AuthUser = { name: 'Ada', email: 'ada@gmail.com', provider: 'google' };

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <DeleteAccountScreen />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  mockUser = PASSWORD_USER;
  mockDeleteAccount.mockReset().mockResolvedValue({ ok: true });
  mockSignInWithGoogle.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => jest.clearAllMocks());

describe('DeleteAccountScreen', () => {
  it('renders the warning sign copy and the destructive confirm button', async () => {
    const { getByText, getByTestId } = await renderScreen('en');
    expect(getByText('Are you sure you want to delete your account?')).toBeTruthy();
    expect(getByText(/permanent and cannot be undone/i)).toBeTruthy();
    expect(getByTestId('delete-account-confirm')).toBeTruthy();
  });

  it('does not delete a password account until a password is entered', async () => {
    const { getByTestId, getByText } = await renderScreen('en');

    await act(async () => {
      fireEvent.press(getByTestId('delete-account-confirm'));
    });

    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(getByText('Please enter your password.')).toBeTruthy();
  });

  it('deletes with the entered password and leaves the screen on success', async () => {
    const { getByTestId, getByPlaceholderText } = await renderScreen('en');

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Enter your password'), 's3cret-pass');
    });
    await act(async () => {
      fireEvent.press(getByTestId('delete-account-confirm'));
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith('s3cret-pass');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/settings/account-deleted'));
  });

  it('surfaces an incorrect-password error and stays on the screen', async () => {
    mockDeleteAccount.mockResolvedValue({ ok: false, code: 'password_incorrect' });
    const { getByTestId, getByPlaceholderText, findByText } = await renderScreen('en');

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Enter your password'), 'wrong');
    });
    await act(async () => {
      fireEvent.press(getByTestId('delete-account-confirm'));
    });

    expect(await findByText('Incorrect password. Please try again.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('re-authenticates with Google before deleting a Google account (no password field)', async () => {
    mockUser = GOOGLE_USER;
    const { getByTestId, getByText, queryByPlaceholderText } = await renderScreen('en');

    expect(queryByPlaceholderText('Enter your password')).toBeNull();
    expect(getByText(/confirm your identity with Google/i)).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('delete-account-confirm'));
    });

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockDeleteAccount).toHaveBeenCalledWith(); // no password argument
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/settings/account-deleted'));
  });

  it('does not delete when the Google re-authentication is cancelled', async () => {
    mockUser = GOOGLE_USER;
    mockSignInWithGoogle.mockResolvedValue({ ok: false, code: 'oauth_cancelled' });
    const { getByTestId, findByText } = await renderScreen('en');

    await act(async () => {
      fireEvent.press(getByTestId('delete-account-confirm'));
    });

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(await findByText('Identity confirmation was cancelled.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
