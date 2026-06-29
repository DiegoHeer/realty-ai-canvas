import type { CityName } from '@realty/data';

/**
 * Lightweight, dependency-free fuzzy search over the municipality list from
 * `/v1/cities`. The list is ~342 short strings, so a per-keystroke linear scan
 * with a simple relevance score is plenty — no need to pull in a fuzzy-search
 * library. Matching is case- and diacritic-insensitive and ignores punctuation,
 * so "den haag", "Den Haag" and "'s-Gravenhage" all behave sensibly.
 */

/**
 * CBS codes of the ten largest municipalities, in descending size order. Drives
 * the onboarding "popular cities" quick-pick pills. The `/v1/cities` endpoint
 * carries no population figure, so the shortlist is curated here and resolved
 * against the live list by code.
 */
export const BIGGEST_CITY_CODES = [
  '0363', // Amsterdam
  '0599', // Rotterdam
  '0518', // Den Haag ('s-Gravenhage)
  '0344', // Utrecht
  '0772', // Eindhoven
  '0014', // Groningen
  '0855', // Tilburg
  '0034', // Almere
  '0758', // Breda
  '0268', // Nijmegen
] as const;

/**
 * Display overrides where the formal name the API returns isn't what users
 * expect to read. Den Haag is filed as '`s-Gravenhage`' in the CBS data.
 */
const DISPLAY_NAMES: Record<string, string> = {
  '0518': 'Den Haag',
};

/**
 * Everyday names that differ from the formal municipality name, so typing the
 * common name still finds the city. Keyed by CBS code; values are extra search
 * strings tested alongside the formal name.
 */
const SEARCH_ALIASES: Record<string, string[]> = {
  '0518': ['Den Haag'], // ↔ 's-Gravenhage
  '0796': ['Den Bosch'], // ↔ 's-Hertogenbosch
};

/** The name to show for a city (applies {@link DISPLAY_NAMES} overrides). */
export function cityDisplayName(city: CityName): string {
  return DISPLAY_NAMES[city.code] ?? city.name;
}

/** Resolve {@link BIGGEST_CITY_CODES} against the loaded list, preserving order. */
export function biggestCities(cities: CityName[]): CityName[] {
  const byCode = new Map(cities.map((c) => [c.code, c]));
  return BIGGEST_CITY_CODES.map((code) => byCode.get(code)).filter(
    (c): c is CityName => c !== undefined,
  );
}

/** Lowercase, strip diacritics, and drop everything but letters/digits. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]/g, '');
}

/** True when every char of `needle` appears in `haystack` in order (a fuzzy hit). */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** Score one normalized candidate against the needle; higher is more relevant. */
function score(haystack: string, needle: string): number {
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 80;
  const idx = haystack.indexOf(needle);
  if (idx >= 0) return 60 - Math.min(idx, 20); // earlier substring ranks higher
  if (isSubsequence(needle, haystack)) return 20;
  return 0;
}

/**
 * Rank `cities` by relevance to `query`, best first, dropping non-matches.
 * Returns at most `limit` results; an empty/whitespace query returns `[]`.
 */
export function searchCities(query: string, cities: CityName[], limit = 20): CityName[] {
  const needle = normalize(query);
  if (!needle) return [];

  const scored: { city: CityName; score: number }[] = [];
  for (const city of cities) {
    const candidates = [city.name, ...(SEARCH_ALIASES[city.code] ?? [])];
    let best = 0;
    for (const candidate of candidates) {
      best = Math.max(best, score(normalize(candidate), needle));
    }
    if (best > 0) scored.push({ city, score: best });
  }

  scored.sort((a, b) => b.score - a.score || a.city.name.localeCompare(b.city.name));
  return scored.slice(0, limit).map((entry) => entry.city);
}
