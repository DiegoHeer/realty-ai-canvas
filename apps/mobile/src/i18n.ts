import { defaultLanguage, i18n, initI18n, isSupportedLanguage } from '@realty/i18n';
import { getLocales } from 'expo-localization';

import { loadJSON, saveJSON, StorageKeys } from './lib/storage';

/** Resolve the device language, falling back to the default when unsupported. */
function deviceLanguage() {
  try {
    const code = getLocales()[0]?.languageCode ?? undefined;
    return isSupportedLanguage(code) ? code : defaultLanguage;
  } catch {
    return defaultLanguage;
  }
}

// Initialise i18next with the device language so the first render isn't blocked
// on AsyncStorage. A saved preference (below) overrides it once storage resolves.
initI18n(deviceLanguage());

// Persist every language change — the profile switcher calls `changeLanguage`,
// which fires this regardless of where the switch originated.
i18n.on('languageChanged', (lng) => {
  if (isSupportedLanguage(lng)) void saveJSON(StorageKeys.language, lng);
});

// Re-apply a previously chosen language once storage resolves. Skipped when the
// user has never overridden the device default.
void loadJSON<string>(StorageKeys.language).then((saved) => {
  if (isSupportedLanguage(saved) && saved !== i18n.language) void i18n.changeLanguage(saved);
});
