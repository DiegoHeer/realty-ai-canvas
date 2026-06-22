import { initI18n } from '@realty/i18n';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';

import AppearanceSettingsScreen from '@/app/settings/appearance';
import { setAppearance } from '@/lib/appearance';

async function renderScreen() {
  const i18n = initI18n('en');
  return render(
    <I18nextProvider i18n={i18n}>
      <AppearanceSettingsScreen />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset the module-level appearance store so test order doesn't matter.
  setAppearance('system');
});

describe('AppearanceSettingsScreen', () => {
  it('lists the appearance options', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('⚙️ System')).toBeTruthy();
    expect(getByText('☀️ Light')).toBeTruthy();
    expect(getByText('🌙 Dark')).toBeTruthy();
  });

  it('applies the chosen appearance and navigates back', async () => {
    const { getByText, getAllByRole } = await renderScreen();

    // The check mark (an svg, per the test mock) marks the selected option, which
    // defaults to System.
    const [systemRow] = getAllByRole('button');
    expect(within(systemRow).queryByTestId('svg')).toBeTruthy();

    fireEvent.press(getByText('🌙 Dark'));

    // The pop is deferred to the next frame (requestAnimationFrame) so the theme
    // swap commits before the transition — see AppearanceSettingsScreen — so the
    // back call is async, not synchronous with the press.
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    // The store update re-renders the page; the check mark moves to Dark.
    await waitFor(() => {
      const [systemAfter, , darkAfter] = getAllByRole('button');
      expect(within(darkAfter).queryByTestId('svg')).toBeTruthy();
      expect(within(systemAfter).queryByTestId('svg')).toBeNull();
    });
  });
});
