import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

export const resources = {
  en: { translation: en },
  nl: { translation: nl },
  pt: { translation: pt },
} as const;

export const supportedLanguages = ['en', 'nl', 'pt'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = 'en';

export function isSupportedLanguage(lng: string | undefined | null): lng is SupportedLanguage {
  return !!lng && (supportedLanguages as readonly string[]).includes(lng);
}

/**
 * Initialise i18next once. The app passes the detected device language;
 * subsequent calls just switch the active language.
 */
export function initI18n(language: SupportedLanguage = defaultLanguage) {
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: defaultLanguage,
      interpolation: { escapeValue: false },
      returnNull: false,
      // `react-native` / Hermes lack Intl in some builds; i18next's own
      // compatibility layer is fine for our plural rules.
    });
  } else if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
  return i18n;
}

export { i18n };
export { useTranslation, Trans, I18nextProvider } from 'react-i18next';
