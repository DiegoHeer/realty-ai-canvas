import { defaultLanguage, initI18n } from '@realty/i18n';

import { activeLanguage } from '../language';

describe('activeLanguage', () => {
  it('returns the current language when supported', () => {
    initI18n('nl');
    expect(activeLanguage()).toBe('nl');
  });

  it('normalizes a region variant to its primary subtag', async () => {
    const instance = initI18n('en');
    await instance.changeLanguage('pt-BR');
    expect(activeLanguage()).toBe('pt');
  });

  it('falls back to the default language when unsupported', async () => {
    const instance = initI18n('en');
    await instance.changeLanguage('de');
    expect(activeLanguage()).toBe(defaultLanguage);
  });
});
