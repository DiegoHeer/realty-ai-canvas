import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin JSON wrappers around AsyncStorage. Every read/write is best-effort:
 * storage failures (quota, corruption, missing native module on web) resolve
 * to a safe default instead of throwing, so a persistence hiccup never crashes
 * the UI. All keys live under a single `realty:` namespace.
 */
const PREFIX = 'realty:';

export const StorageKeys = {
  language: `${PREFIX}language`,
  appearance: `${PREFIX}appearance`,
  /** The signed-in user's session (mock auth); absent when signed out. */
  session: `${PREFIX}session`,
  recentSearches: `${PREFIX}recent-searches`,
  recentViews: `${PREFIX}recent-views`,
  /** Listings the user liked via the heart toggle ("favorites" in the UI). */
  likes: `${PREFIX}likes`,
  /** Cached neighborhood boundaries; suffixed with `:<cityCode>` per city. */
  areas: `${PREFIX}areas`,
  /** Cached neighborhood statistics; suffixed with `:<cityCode>` per city. */
  stats: `${PREFIX}stats`,
  /** Cached municipality boundaries for the whole country (a single list). */
  cities: `${PREFIX}cities`,
  /** The map search filters (buy/rent, price, type, …); see lib/filters.ts. */
  filters: `${PREFIX}filters`,
  /** Intro tour progress (furthest page + done flag); see lib/onboarding.ts. */
  onboarding: `${PREFIX}onboarding`,
} as const;

export async function loadJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort: a failed write shouldn't surface to the user.
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Best-effort.
  }
}
