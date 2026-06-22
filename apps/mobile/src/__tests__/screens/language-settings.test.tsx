import { initI18n } from '@realty/i18n';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';

import LanguageSettingsScreen from '@/app/settings/language';

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  const view = await render(
    <I18nextProvider i18n={i18n}>
      <LanguageSettingsScreen />
    </I18nextProvider>,
  );
  return { i18n, ...view };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LanguageSettingsScreen', () => {
  it('lists every supported language as its own endonym', async () => {
    const { getByText } = await renderScreen('en');
    expect(getByText('🇬🇧 English')).toBeTruthy();
    expect(getByText('🇳🇱 Nederlands')).toBeTruthy();
    expect(getByText('🇵🇹 Português')).toBeTruthy();
  });

  it('applies the chosen language and navigates back', async () => {
    const { getByText, i18n } = await renderScreen('en');
    expect(i18n.language).toBe('en');

    fireEvent.press(getByText('🇳🇱 Nederlands'));

    // The pop is deferred to the next frame (requestAnimationFrame) so the
    // global language re-render commits before the transition — see
    // LanguageSettingsScreen — so the back call is async, not synchronous.
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(i18n.language).toBe('nl'));
  });
});
