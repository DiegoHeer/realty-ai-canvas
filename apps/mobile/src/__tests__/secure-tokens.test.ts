import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

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

// On web there is no keychain: expo-secure-store rejects, and before the
// AsyncStorage fallback every session silently evaporated on page reload.
describe('secure-tokens (web fallback)', () => {
  beforeEach(() => {
    // Drop call records from the native-path tests above so the
    // "SecureStore untouched" assertions see only this block's traffic.
    jest.clearAllMocks();
    jest.replaceProperty(Platform, 'OS', 'web');
  });

  afterEach(async () => {
    await clearTokens();
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('round-trips tokens through AsyncStorage, not SecureStore', async () => {
    const SecureStore = require('expo-secure-store');
    await saveTokens({ accessToken: 'AT', refreshToken: 'RT' });

    expect(await loadTokens()).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
    expect(await AsyncStorage.getItem('realty.tokens')).not.toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('clears tokens from AsyncStorage', async () => {
    await saveTokens({ accessToken: 'AT', refreshToken: 'RT' });
    await clearTokens();
    expect(await loadTokens()).toBeNull();
    expect(await AsyncStorage.getItem('realty.tokens')).toBeNull();
  });
});
