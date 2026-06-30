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

// The allauth session token handed back by signup while email verification is
// pending. It's the only handle for completing verification, so persist it —
// reading the emailed code usually means backgrounding the app, and an OS
// eviction would otherwise lose it and dead-end the verify screen.
const PENDING_SESSION_KEY = 'realty.pending_session';

// The allauth session token handed back by `password/request` while a reset is
// pending. Persisted for the same reason as the verify token: reading the
// emailed reset code usually means backgrounding the app, and an OS eviction
// would otherwise lose it and dead-end the reset screen. Kept separate from the
// verify token so a reset in progress never collides with a signup verification.
const PENDING_RESET_KEY = 'realty.pending_reset';

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

export async function loadPendingSession(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PENDING_SESSION_KEY);
  } catch {
    return null;
  }
}

export async function savePendingSession(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_SESSION_KEY, token);
  } catch {
    // Best-effort.
  }
}

export async function clearPendingSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_SESSION_KEY);
  } catch {
    // Best-effort.
  }
}

export async function loadPendingReset(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PENDING_RESET_KEY);
  } catch {
    return null;
  }
}

export async function savePendingReset(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_RESET_KEY, token);
  } catch {
    // Best-effort.
  }
}

export async function clearPendingReset(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_RESET_KEY);
  } catch {
    // Best-effort.
  }
}
