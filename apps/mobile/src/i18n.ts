import { defaultLanguage, initI18n, isSupportedLanguage } from '@realty/i18n';
import { getLocales } from 'expo-localization';

/** Resolve the device language, falling back to the default when unsupported. */
function deviceLanguage() {
  try {
    const code = getLocales()[0]?.languageCode ?? undefined;
    return isSupportedLanguage(code) ? code : defaultLanguage;
  } catch {
    return defaultLanguage;
  }
}

// Initialise i18next with the device language before the app renders.
initI18n(deviceLanguage());
