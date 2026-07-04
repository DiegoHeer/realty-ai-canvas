import { initI18n } from '@realty/i18n';
import { render } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import AboutSettingsScreen from '@/app/settings/about';
import HelpSettingsScreen from '@/app/settings/help';
import NotificationsSettingsScreen from '@/app/settings/notifications';
import PrivacySettingsScreen from '@/app/settings/privacy';
import SubscriptionSettingsScreen from '@/app/settings/subscription';

function renderScreen(node: ReactElement, language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

describe('PrivacySettingsScreen', () => {
  it('states the zero-data stance', async () => {
    const { getByText } = await renderScreen(<PrivacySettingsScreen />);
    expect(getByText('A zero-data company')).toBeTruthy();
    expect(getByText(/We collect zero user data/)).toBeTruthy();
    expect(getByText(/don't collect or redistribute your search filters/)).toBeTruthy();
  });
});

describe('AboutSettingsScreen', () => {
  it('shows the app name and version', async () => {
    const { getByText } = await renderScreen(<AboutSettingsScreen />);
    expect(getByText('Huismus')).toBeTruthy();
    expect(getByText('Version')).toBeTruthy();
    expect(getByText('1.0.0')).toBeTruthy();
  });
});

describe('HelpSettingsScreen', () => {
  it('renders the FAQ and the coming-soon note', async () => {
    const { getByText } = await renderScreen(<HelpSettingsScreen />);
    expect(getByText('Frequently asked questions')).toBeTruthy();
    expect(getByText('How do I search for homes?')).toBeTruthy();
    expect(getByText('More support features coming soon.')).toBeTruthy();
  });
});

describe('SubscriptionSettingsScreen', () => {
  it('shows the coming-soon placeholder', async () => {
    const { getByText } = await renderScreen(<SubscriptionSettingsScreen />);
    expect(getByText('Subscription and payment methods coming soon.')).toBeTruthy();
  });
});

describe('NotificationsSettingsScreen', () => {
  it('shows the coming-soon placeholder', async () => {
    const { getByText } = await renderScreen(<NotificationsSettingsScreen />);
    expect(getByText('Notification settings coming soon.')).toBeTruthy();
  });
});
