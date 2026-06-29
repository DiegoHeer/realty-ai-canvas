import * as SecureStore from 'expo-secure-store';

/**
 * JWT access + refresh tokens, persisted in the device keychain/keystore via
 * expo-secure-store. This is the sanctioned exception to the AsyncStorage-only
 * storage rule: tokens are sensitive credentials. Like `lib/storage`, every
 * operation is best-effort and resolves to a safe default instead of throwing.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

// SecureStore keys must be alphanumeric + ".-_"; the `realty:` colon prefix
// used by AsyncStorage isn't valid here, so use a dot.
const TOKENS_KEY = 'realty.tokens';

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKENS_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTokens>;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // Best-effort.
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKENS_KEY);
  } catch {
    // Best-effort.
  }
}
