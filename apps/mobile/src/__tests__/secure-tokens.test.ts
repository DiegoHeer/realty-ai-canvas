import { clearTokens, loadTokens, saveTokens } from '@/lib/secure-tokens';

describe('secure-tokens', () => {
  afterEach(async () => {
    await clearTokens();
  });

  it('round-trips tokens', async () => {
    await saveTokens({ accessToken: 'AT', refreshToken: 'RT' });
    expect(await loadTokens()).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
  });

  it('returns null after clear', async () => {
    await saveTokens({ accessToken: 'AT', refreshToken: 'RT' });
    await clearTokens();
    expect(await loadTokens()).toBeNull();
  });

  it('returns null (never throws) on malformed storage', async () => {
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync('realty.tokens', 'not-json');
    expect(await loadTokens()).toBeNull();
  });
});
