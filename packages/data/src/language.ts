import { defaultLanguage, i18n, isSupportedLanguage } from '@realty/i18n';

/**
 * Current UI language as a bare code (`en`/`nl`/`pt`) suitable for the
 * `Accept-Language` header, so the Django backend can render transactional
 * emails (verification codes, password resets, security notices) in the
 * user's language instead of always defaulting to English.
 *
 * `i18next` can report a region variant (e.g. `en-US`, `nl-NL`) depending on
 * the platform's locale detection, so we take the primary subtag before
 * matching it against `@realty/i18n`'s supported set — the single source of
 * truth for what the app (and now the backend) understands. Falls back to
 * {@link defaultLanguage} for anything unsupported or before `initI18n` runs.
 */
export function activeLanguage(): string {
  const primary = i18n.language?.split('-')[0];
  return isSupportedLanguage(primary) ? primary : defaultLanguage;
}
