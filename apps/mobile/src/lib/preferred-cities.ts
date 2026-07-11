import { setMapFocus } from './map-focus';
import { loadJSON, saveJSON, StorageKeys } from './storage';

/** A city the user marked as a search preference on the intro tour. */
export interface PreferredCity {
  /** CBS municipality code, e.g. `0014` for Groningen. */
  code: string;
  /** Display name as shown when it was picked (see cityDisplayName). */
  name: string;
}

/**
 * The cities picked on the intro tour's cities step, persisted in pick order as
 * the user's "preferred cities". Today the first one decides where the map
 * opens: every boot re-queues it as the one-shot map focus (see lib/map-focus),
 * so the app always launches looking at that city. Later the whole list will
 * feed the notification system (alerts for new listings in these cities).
 *
 * Same module-level store shape as lib/onboarding, minus the React hook —
 * nothing renders the list yet, so there are no subscribers to notify.
 */
let current: PreferredCity[] = [];

/** The saved preference, in the order the user picked the cities. */
export function getPreferredCities(): PreferredCity[] {
  return current;
}

/** Replace the preference (the tour saves its full staged selection on finish). */
export function setPreferredCities(cities: PreferredCity[]) {
  current = cities;
  void saveJSON(StorageKeys.preferredCities, cities);
}

/** Keep only well-formed entries, so a corrupt record can't crash callers. */
function sanitize(stored: unknown): PreferredCity[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (c): c is PreferredCity =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as PreferredCity).code === 'string' &&
      typeof (c as PreferredCity).name === 'string',
  );
}

let hydrating: Promise<void> | null = null;

/**
 * Load the saved preference and queue the launch focus on the first city (the
 * map acts on it once the city shapes are loaded — see the pendingFocus effect
 * in `app/(tabs)/index.tsx`). Safe to call repeatedly; runs once. Memoizes the
 * promise rather than a boolean flag so callers (tests) can await completion.
 */
export function hydratePreferredCities(): Promise<void> {
  hydrating ??= (async () => {
    current = sanitize(await loadJSON(StorageKeys.preferredCities));
    const first = current[0];
    if (first) setMapFocus({ code: first.code, name: first.name });
  })();
  return hydrating;
}

// Hydrate as soon as the module is first imported (the root layout imports this
// for the boot-time side effect, alongside lib/appearance and lib/onboarding).
void hydratePreferredCities();
