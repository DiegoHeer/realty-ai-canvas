import { initI18n } from '@realty/i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';

import AccountDeletedScreen from '@/app/settings/account-deleted';

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <AccountDeletedScreen />
    </I18nextProvider>,
  );
}

afterEach(() => jest.clearAllMocks());

describe('AccountDeletedScreen', () => {
  it('shows the success message and subtitle', async () => {
    const { getByText } = await renderScreen('en');
    expect(getByText('Account successfully deleted')).toBeTruthy();
    expect(getByText('Feel free to continue using the app without an account.')).toBeTruthy();
  });

  it('continues to the map (index)', async () => {
    const { getByTestId } = await renderScreen('en');
    await act(async () => {
      fireEvent.press(getByTestId('account-deleted-continue'));
    });
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('is localized (Dutch)', async () => {
    const { getByText } = await renderScreen('nl');
    expect(getByText('Account succesvol verwijderd')).toBeTruthy();
  });
});
