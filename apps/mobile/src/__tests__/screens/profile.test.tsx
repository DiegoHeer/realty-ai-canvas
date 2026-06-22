import { initI18n } from '@realty/i18n';
import { fireEvent, render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { Alert } from 'react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import { signIn, signOut } from '@/hooks/use-auth';

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <ProfileScreen />
    </I18nextProvider>,
  );
}

// The mock auth store is module-level state shared across tests; reset it to the
// signed-in user before each test so order between tests doesn't matter.
beforeEach(() => {
  signIn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ProfileScreen', () => {
  it('renders title and subtitle in English', async () => {
    const { getByText } = await renderScreen('en');
    expect(getByText('Profile')).toBeTruthy();
    expect(getByText('Manage your account and preferences')).toBeTruthy();
  });

  it('renders title and subtitle in Dutch', async () => {
    const { getByText } = await renderScreen('nl');
    expect(getByText('Profiel')).toBeTruthy();
    expect(getByText('Beheer je account en voorkeuren')).toBeTruthy();
  });

  it('confirms with a native dialog before signing out, and signs out only after confirming', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText, queryByText } = await renderScreen('en');

    fireEvent.press(getByText('Sign out'));

    // The native confirmation dialog is shown with the localized copy…
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Sign out?');
    expect(message).toBe('Are you sure you want to sign out?');

    // …and merely opening it does not sign the user out yet — the button is
    // still on screen, so no sign-out happened on the first tap.
    expect(queryByText('Sign out')).toBeTruthy();

    // The dialog offers a cancel and a destructive confirm; the confirm button
    // is the one wired to actually sign out.
    const cancel = (buttons ?? []).find((button) => button.style === 'cancel');
    const confirm = (buttons ?? []).find((button) => button.style === 'destructive');
    expect(cancel?.text).toBe('Cancel');
    expect(confirm?.text).toBe('Sign out');
    expect(confirm?.onPress).toBe(signOut);
  });
});
