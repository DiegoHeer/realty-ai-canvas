import { getAreas, getCities, getStats } from '@realty/data';
import type { AreaPolygon, CityShape, NeighborhoodStats } from '@realty/types';

import { loadJSON, saveJSON, StorageKeys } from './storage';

/** AsyncStorage key for a city's cached boundaries, e.g. `realty:areas:0518`. */
const areasKey = (city: string) => `${StorageKeys.areas}:${city}`;
/** AsyncStorage key for a city's cached statistics, e.g. `realty:stats:v2:0518`. */
const statsKey = (city: string) => `${StorageKeys.stats}:${city}`;

/**
 * Neighborhood boundaries for a city (CBS municipality code, e.g. `0518` for
 * Den Haag), permanently cached on device under that code.
 *
 * Boundaries never change, so once a city's areas are fetched they're served
 * from AsyncStorage forever: when a cache entry exists for the requested city,
 * the API is not called at all — not even across app launches. A cache miss
 * fetches via {@link getAreas} and persists the result under the city's key. An
 * empty result (no backend configured / a failed fetch) is never cached, so
 * it's retried on the next launch rather than locking in "no areas".
 */
export async function loadAreas(city: string): Promise<AreaPolygon[]> {
  const key = areasKey(city);

  const cached = await loadJSON<AreaPolygon[]>(key);
  if (cached && cached.length > 0) return cached;

  const areas = await getAreas(city);
  if (areas.length > 0) await saveJSON(key, areas);
  return areas;
}

/**
 * Neighborhood statistics for a city, cached identically to {@link loadAreas}:
 * keyed by city code, served from AsyncStorage when present (no API call), and
 * fetched + persisted only on a miss. Match entries to areas by `code`.
 */
export async function loadStats(city: string): Promise<NeighborhoodStats[]> {
  const key = statsKey(city);

  const cached = await loadJSON<NeighborhoodStats[]>(key);
  if (cached && cached.length > 0) return cached;

  const stats = await getStats(city);
  if (stats.length > 0) await saveJSON(key, stats);
  return stats;
}

/**
 * All municipality boundaries for the country, permanently cached on device.
 * Cached exactly like {@link loadAreas} but under a single key (the list covers
 * the whole country): served from AsyncStorage when present (no API call),
 * fetched + persisted only on a miss, and never cached when empty so it retries.
 */
export async function loadCities(): Promise<CityShape[]> {
  const cached = await loadJSON<CityShape[]>(StorageKeys.cities);
  if (cached && cached.length > 0) return cached;

  const cities = await getCities();
  if (cities.length > 0) await saveJSON(StorageKeys.cities, cities);
  return cities;
}
