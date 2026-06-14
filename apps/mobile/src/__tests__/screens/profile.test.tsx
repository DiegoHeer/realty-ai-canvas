import { initI18n } from '@realty/i18n';
import { render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import ProfileScreen from '@/app/(tabs)/profile';

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <ProfileScreen />
    </I18nextProvider>,
  );
}

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
});
