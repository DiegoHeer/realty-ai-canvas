import { initI18n } from '@realty/i18n';
import { fireEvent, render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import PrivacySettingsScreen from '@/app/settings/privacy';
import { isOptedOut, setOptedOut } from '@/lib/analytics';

async function renderScreen() {
  const i18n = initI18n('en');
  return render(
    <I18nextProvider i18n={i18n}>
      <PrivacySettingsScreen />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  // Reset the module-level opt-out store so test order doesn't matter.
  setOptedOut(false);
});

describe('PrivacySettingsScreen', () => {
  it('renders the usage-measurement opt-out control', async () => {
    const { getByText, getByRole } = await renderScreen();
    expect(getByText('Measure my in-app usage')).toBeTruthy();
    // On by default (not opted out).
    expect(getByRole('switch').props.value).toBe(true);
  });

  it('opts out when the switch is turned off, and back in when on', async () => {
    const { getByRole } = await renderScreen();
    const toggle = getByRole('switch');

    fireEvent(toggle, 'valueChange', false);
    expect(isOptedOut()).toBe(true);

    fireEvent(toggle, 'valueChange', true);
    expect(isOptedOut()).toBe(false);
  });
});
