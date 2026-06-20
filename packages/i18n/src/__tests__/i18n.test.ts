import i18n from 'i18next';

import { defaultLanguage, initI18n, isSupportedLanguage, supportedLanguages } from '../index';
import en from '../locales/en.json';
import nl from '../locales/nl.json';
import pt from '../locales/pt.json';

afterEach(() => {
  if (i18n.isInitialized) {
    // i18next doesn't have a clean destroy; re-init to default in each test instead
  }
});

describe('isSupportedLanguage', () => {
  it('returns true for "en"', () => {
    expect(isSupportedLanguage('en')).toBe(true);
  });

  it('returns true for "nl"', () => {
    expect(isSupportedLanguage('nl')).toBe(true);
  });

  it('returns false for "de"', () => {
    expect(isSupportedLanguage('de')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSupportedLanguage(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSupportedLanguage(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSupportedLanguage('')).toBe(false);
  });
});

describe('initI18n', () => {
  it('initialises with English by default', () => {
    const instance = initI18n();
    expect(instance.language).toBe('en');
    expect(instance.isInitialized).toBe(true);
  });

  it('initialises with Dutch when requested', () => {
    const instance = initI18n('nl');
    expect(instance.language).toBe('nl');
  });

  it('switches language on subsequent calls', () => {
    initI18n('en');
    const instance = initI18n('nl');
    expect(instance.language).toBe('nl');
  });

  it('translates a key in English', () => {
    initI18n('en');
    expect(i18n.t('tabs.map')).toBe('Map');
  });

  it('translates a key in Dutch', () => {
    initI18n('nl');
    expect(i18n.t('tabs.map')).toBe('Kaart');
  });
});

describe('constants', () => {
  it('has en, nl and pt as supported languages', () => {
    expect(supportedLanguages).toEqual(['en', 'nl', 'pt']);
  });

  it('defaults to English', () => {
    expect(defaultLanguage).toBe('en');
  });
});

describe('locale completeness', () => {
  function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null) {
        keys.push(...flatKeys(v as Record<string, unknown>, path));
      } else {
        keys.push(path);
      }
    }
    return keys.sort();
  }

  it('nl.json has every key that en.json has', () => {
    const enKeys = flatKeys(en);
    const nlKeys = flatKeys(nl);
    const missingInNl = enKeys.filter((k) => !nlKeys.includes(k));
    expect(missingInNl).toEqual([]);
  });

  it('en.json has every key that nl.json has', () => {
    const enKeys = flatKeys(en);
    const nlKeys = flatKeys(nl);
    const missingInEn = nlKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);
  });

  it('pt.json has every key that en.json has', () => {
    const enKeys = flatKeys(en);
    const ptKeys = flatKeys(pt);
    const missingInPt = enKeys.filter((k) => !ptKeys.includes(k));
    expect(missingInPt).toEqual([]);
  });

  it('en.json has every key that pt.json has', () => {
    const enKeys = flatKeys(en);
    const ptKeys = flatKeys(pt);
    const missingInEn = ptKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);
  });
});
