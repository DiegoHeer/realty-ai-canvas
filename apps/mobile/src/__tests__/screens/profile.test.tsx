import { initI18n } from '@realty/i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import { Alert, Platform } from 'react-native';

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

  it('shows Subscription and drops the removed account rows', async () => {
    const { getByText, queryByText } = await renderScreen('en');
    expect(getByText('Subscription')).toBeTruthy();
    expect(queryByText('Saved homes')).toBeNull();
    expect(queryByText('Saved searches')).toBeNull();
    expect(queryByText('Payment methods')).toBeNull();
  });

  it('navigates to the matching settings page from each row', async () => {
    const cases: [label: string, path: string][] = [
      ['Notifications', '/settings/notifications'],
      ['Subscription', '/settings/subscription'],
      ['Privacy & security', '/settings/privacy'],
      ['Help & support', '/settings/help'],
      ['About', '/settings/about'],
    ];

    const { getByText } = await renderScreen('en');

    // Wrap each press in its own settled act() scope — React 19 + RNTL otherwise
    // overlap the Pressable's re-renders across iterations (see login.test.tsx).
    for (const [label, path] of cases) {
      await act(async () => {
        fireEvent.press(getByText(label));
      });
      expect(router.push).toHaveBeenCalledWith(path);
    }
  });

  it('shows Delete account when signed in and opens the delete-account screen', async () => {
    const { getByText } = await renderScreen('en');
    await act(async () => {
      fireEvent.press(getByText('Delete account'));
    });
    expect(router.push).toHaveBeenCalledWith('/settings/delete-account');
  });

  it('hides Delete account when signed out', async () => {
    await act(async () => {
      await signOut();
    });
    const { queryByText } = await renderScreen('en');
    expect(queryByText('Delete account')).toBeNull();
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

  // On web, react-native-web's Alert.alert is a no-op — the dialog never
  // renders and sign-out can never be confirmed (the original bug). The screen
  // falls back to the browser's window.confirm there. We drive Platform.OS to
  // 'web' and stub window.confirm because the jest env defines window but not
  // confirm; both are restored afterward so other tests stay on iOS.
  function withWebConfirm(result: boolean, run: (confirmSpy: jest.Mock) => Promise<void>) {
    return async () => {
      const originalOS = Platform.OS;
      const originalConfirm = window.confirm;
      const confirmSpy = jest.fn(() => result);
      // @ts-expect-error override the platform for this test
      Platform.OS = 'web';
      window.confirm = confirmSpy;
      try {
        await run(confirmSpy);
      } finally {
        // @ts-expect-error restore the platform
        Platform.OS = originalOS;
        window.confirm = originalConfirm;
      }
    };
  }

  it(
    'on web, confirms via window.confirm and signs out when accepted',
    withWebConfirm(true, async (confirmSpy) => {
      const { getByText, queryByText } = await renderScreen('en');

      await act(async () => {
        fireEvent.press(getByText('Sign out'));
      });

      // The browser confirm is shown with both localized lines…
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0][0]).toContain('Sign out?');
      expect(confirmSpy.mock.calls[0][0]).toContain('Are you sure you want to sign out?');

      // …and accepting it actually signs the user out, so the button is gone
      // and the guest call-to-action takes its place.
      expect(queryByText('Sign out')).toBeNull();
      expect(queryByText('Log in')).toBeTruthy();
    }),
  );

  it(
    'on web, does not sign out when the confirm is dismissed',
    withWebConfirm(false, async (confirmSpy) => {
      const { getByText, queryByText } = await renderScreen('en');

      await act(async () => {
        fireEvent.press(getByText('Sign out'));
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      // Dismissing leaves the session intact — the button is still on screen.
      expect(queryByText('Sign out')).toBeTruthy();
    }),
  );
});
