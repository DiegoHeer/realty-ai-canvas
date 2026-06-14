import 'i18next';

import type en from './locales/en.json';

// Strongly-type t() keys against the English resource (source of truth).
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
