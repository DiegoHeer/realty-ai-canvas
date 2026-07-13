import { searchResidences } from '@realty/data';
import type { Listing } from '@realty/types';

import {
  geocode,
  lookup,
  lookupBuurt,
  suggest,
  type GeocodeResult,
  type GeocodeSuggestion,
} from './pdok';

/**
 * Search orchestration for the map search bar. The bar draws suggestions from up
 * to three sources — homes (the backend's fuzzy residence typeahead), buurten
 * (PDOK neighborhoods/wijken), and places (PDOK cities/streets/addresses) — and
 * each picked result carries exactly what the map needs to act on it. Sources
 * are opt-in per screen (see {@link SearchSource}); the explore tab keeps the
 * original places-only behavior by defaulting to `['places']`.
 */

/** Which suggestion sources a search bar draws from. */
export type SearchSource = 'homes' | 'buurten' | 'places';

// PDOK Solr type filters. Places deliberately excludes buurt/wijk so those don't
// appear both here and in the dedicated Neighborhoods section.
const PLACE_TYPES_FQ = 'type:(gemeente OR woonplaats OR weg OR postcode OR adres)';
const BUURT_TYPES_FQ = 'type:(buurt OR wijk)';

// Per-section caps so a single source can't crowd out the dropdown.
const BUURT_LIMIT = 4;
const PLACE_LIMIT = 5;

/**
 * A dropdown row before the user commits to it. Places and buurten carry the
 * PDOK centroid (null when unknown) so the merged list can be ranked by distance;
 * homes carry the {@link Listing}, whose `location` serves the same purpose.
 */
export type SearchSuggestion =
  | { kind: 'place'; id: string; label: string; type: string; longitude: number | null; latitude: number | null }
  | { kind: 'buurt'; id: string; label: string; type: string; longitude: number | null; latitude: number | null }
  // Homes come back fully resolved from the backend, so they carry the Listing.
  | { kind: 'residence'; id: string; label: string; listing: Listing };

/** A geographic origin (typically the map's current centre) to rank against. */
export interface Origin {
  longitude: number;
  latitude: number;
}

/** A picked, resolved result the map screen acts on. */
export type SearchResult =
  | { kind: 'place'; result: GeocodeResult }
  | {
      kind: 'buurt';
      label: string;
      longitude: number;
      latitude: number;
      gemeentecode: string;
      buurtcode: string | null;
    }
  | { kind: 'residence'; listing: Listing };

/** Human-readable one-liner for a home: street + city, falling back to its title. */
export function homeLabel(listing: Listing): string {
  const parts = [listing.address.line1, listing.address.city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : listing.title;
}

/** Display label for a resolved result (recents list, field value). */
export function resultLabel(result: SearchResult): string {
  switch (result.kind) {
    case 'place':
      return result.result.label;
    case 'buurt':
      return result.label;
    case 'residence':
      return homeLabel(result.listing);
  }
}

/** Stable identity for a resolved result — dedupes the recents MRU list. */
export function resultKey(result: SearchResult): string {
  switch (result.kind) {
    case 'place':
      return `place|${result.result.label}|${result.result.type}`;
    case 'buurt':
      return `buurt|${result.buurtcode ?? result.label}`;
    case 'residence':
      return `residence|${result.listing.id}`;
  }
}

/**
 * The result's type for analytics — the PDOK type for a place, `buurt`/`wijk`
 * for a neighborhood (a wijk has no buurt code), or `residence` for a home.
 */
export function resultType(result: SearchResult): string {
  switch (result.kind) {
    case 'place':
      return result.result.type;
    case 'buurt':
      return result.buurtcode ? 'buurt' : 'wijk';
    case 'residence':
      return 'residence';
  }
}

/**
 * Split a suggestion label into a `primary` part (the street + house number, or
 * a neighborhood name) shown on the left, and a `secondary` part (the zipcode,
 * if any, plus the city) shown right in a softer tone. PDOK comma-separates the
 * two — "Kromstraat, Delft" → "Kromstraat" | "Delft", "Kielawater 1, 2497ZS
 * 's-Gravenhage" → "Kielawater 1" | "2497ZS 's-Gravenhage". Buurten carry no
 * comma ("Zeeheldenbuurt Delft"), so their trailing city word is split off
 * instead; a bare city (a gemeente) has no secondary part.
 */
export function splitSuggestionLabel(suggestion: SearchSuggestion): {
  primary: string;
  secondary: string;
} {
  const { label } = suggestion;
  const comma = label.indexOf(',');
  if (comma !== -1) {
    return { primary: label.slice(0, comma).trim(), secondary: label.slice(comma + 1).trim() };
  }
  if (suggestion.kind === 'buurt') {
    const lastSpace = label.lastIndexOf(' ');
    if (lastSpace !== -1) {
      return { primary: label.slice(0, lastSpace).trim(), secondary: label.slice(lastSpace + 1).trim() };
    }
  }
  return { primary: label, secondary: '' };
}

function toHomeSuggestions(listings: Listing[]): SearchSuggestion[] {
  return listings.map((listing) => ({
    kind: 'residence',
    id: listing.id,
    label: homeLabel(listing),
    listing,
  }));
}

function toBuurtSuggestions(docs: GeocodeSuggestion[]): SearchSuggestion[] {
  return docs.slice(0, BUURT_LIMIT).map((doc) => ({
    kind: 'buurt',
    id: doc.id,
    label: doc.label,
    type: doc.type,
    longitude: doc.longitude,
    latitude: doc.latitude,
  }));
}

function toPlaceSuggestions(docs: GeocodeSuggestion[]): SearchSuggestion[] {
  return docs.slice(0, PLACE_LIMIT).map((doc) => ({
    kind: 'place',
    id: doc.id,
    label: doc.label,
    type: doc.type,
    longitude: doc.longitude,
    latitude: doc.latitude,
  }));
}

/** A suggestion's centre coordinate, when known — a home's location or a PDOK centroid. */
function suggestionCenter(suggestion: SearchSuggestion): Origin | null {
  if (suggestion.kind === 'residence') {
    const { longitude, latitude } = suggestion.listing.location;
    return { longitude, latitude };
  }
  return suggestion.longitude != null && suggestion.latitude != null
    ? { longitude: suggestion.longitude, latitude: suggestion.latitude }
    : null;
}

// Great-circle distance (Haversine) between two coordinates. Only used to order
// suggestions, so the earth-radius unit is immaterial.
function distanceBetween(a: Origin, b: Origin): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(h));
}

/**
 * PDOK returns a city as both a `gemeente` ("Gemeente Delft", shown as "Delft"
 * once the prefix is stripped) and a `woonplaats` ("Delft, Delft, Zuid-Holland").
 * They share a leading name token but not always a centroid, so key the dedupe
 * on that token rather than the coordinate. Only `gemeente`/`woonplaats` are
 * collapsed, so a street or address that merely shares the city's name survives,
 * and distinct same-named towns — which PDOK disambiguates ("Bergen (NH)" vs
 * "Bergen (L)") — keep distinct keys. Returns null for rows that never dedupe.
 */
function cityKey(suggestion: SearchSuggestion): string | null {
  if (suggestion.kind !== 'place') return null;
  if (suggestion.type !== 'gemeente' && suggestion.type !== 'woonplaats') return null;
  return suggestion.label.split(',')[0].trim().toLowerCase();
}

/** Drop duplicate city rows, keeping the first (most relevant) per {@link cityKey}. */
function dedupeCities(list: SearchSuggestion[]): SearchSuggestion[] {
  const seen = new Set<string>();
  return list.filter((suggestion) => {
    const key = cityKey(suggestion);
    if (key === null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Case- and accent-insensitive fold for text matching. `normalize` is guarded
// because a few JS engines omit it; there we just lower-case.
const CAN_NORMALIZE = (() => {
  try {
    return 'a'.normalize('NFD') === 'a';
  } catch {
    return false;
  }
})();

function fold(text: string): string {
  const lower = text.toLowerCase();
  if (!CAN_NORMALIZE) return lower;
  // Drop the combining diacritical marks (U+0300–U+036F) that NFD splits off,
  // so "Súdwest" folds to "sudwest".
  let out = '';
  for (const ch of lower.normalize('NFD')) {
    const code = ch.charCodeAt(0);
    if (code < 0x0300 || code > 0x036f) out += ch;
  }
  return out;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}

/**
 * How well `query` matches `label`, from 0 (no match) to 1 (exact): whole-string
 * prefix 0.9, a label word starting with the query 0.8, any substring 0.6, an
 * in-order subsequence 0.4 — each nudged up by how much of the label the query
 * covers, so a short label the query nearly fills outranks a longer one.
 */
function matchScore(query: string, label: string): number {
  const q = fold(query.trim());
  if (!q) return 0;
  const l = fold(label);
  if (l === q) return 1;
  let base: number;
  if (l.startsWith(q)) base = 0.9;
  else if (l.split(/[^a-z0-9]+/).some((word) => word.length > 0 && word.startsWith(q))) base = 0.8;
  else if (l.includes(q)) base = 0.6;
  else if (isSubsequence(q, l)) base = 0.4;
  else return 0;
  return base * (0.7 + (0.3 * q.length) / l.length);
}

// Average ("fractional") rank of each value under `cmp`: tied values share the
// mean of the positions they span, so a tie on one axis leaves the other axis
// to break it rather than leaking input order into the blend.
function averageRanks(values: number[], cmp: (a: number, b: number) => number): number[] {
  const order = values.map((_, i) => i).sort((a, b) => cmp(values[a], values[b]));
  const rank = new Array<number>(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && cmp(values[order[j + 1]], values[order[i]]) === 0) j += 1;
    const mean = (i + j) / 2;
    for (let k = i; k <= j; k += 1) rank[order[k]] = mean;
    i = j + 1;
  }
  return rank;
}

// Weight of text relevance in the blend; distance takes the rest. 0.5 → 50/50.
const TEXT_WEIGHT = 0.5;

/**
 * Rank the merged list for display: an equal (50/50) blend of text relevance to
 * `query` and distance from `origin`. Each factor is taken as a position in its
 * own ordering (an average rank) so the two combine on one scale and a tie on
 * one factor defers to the other. Coordinate-less rows count as farthest. With
 * no origin (e.g. the explore tab, which has no map centre) the list is returned
 * untouched in its PDOK-relevance order.
 */
function rankSuggestions(
  list: SearchSuggestion[],
  query: string,
  origin?: Origin,
): SearchSuggestion[] {
  if (!origin || list.length < 2) return list;
  const distances = list.map((suggestion) => {
    const center = suggestionCenter(suggestion);
    return center ? distanceBetween(origin, center) : Infinity;
  });
  const scores = list.map((suggestion) => matchScore(query, suggestion.label));
  const distanceRank = averageRanks(distances, (a, b) => a - b); // nearer → lower rank
  const textRank = averageRanks(scores, (a, b) => b - a); // better match → lower rank
  const blended = list.map((_, i) => TEXT_WEIGHT * textRank[i] + (1 - TEXT_WEIGHT) * distanceRank[i]);
  return list
    .map((suggestion, index) => ({ suggestion, index, blend: blended[index] }))
    .sort((a, b) => (a.blend === b.blend ? a.index - b.index : a.blend - b.blend))
    .map((entry) => entry.suggestion);
}

/**
 * Fetch suggestions from every requested source in parallel and return them as a
 * single list: the same city coming back as both a gemeente and a woonplaats is
 * collapsed (see {@link dedupeCities}), then the rest is ranked by a 50/50 blend
 * of text relevance to `query` and distance from `origin` (see
 * {@link rankSuggestions}) when an origin is given. Sources fail independently —
 * a slow or erroring source contributes nothing rather than sinking the others —
 * matching the bar's "show what we have" behavior. Merge order before ranking is
 * homes, buurten, then places, which also stands in as the relevance order when
 * no origin is supplied.
 */
export async function suggestAll(
  query: string,
  sources: readonly SearchSource[],
  signal?: AbortSignal,
  origin?: Origin,
): Promise<SearchSuggestion[]> {
  const want = (source: SearchSource) => sources.includes(source);
  // Only carve buurt/wijk out of Places when the Buurten source is also on (so
  // they aren't listed twice); places-only screens keep PDOK's full result set.
  const placesFilter = want('buurten') ? PLACE_TYPES_FQ : undefined;
  const none = Promise.resolve<SearchSuggestion[]>([]);
  const onError = (): SearchSuggestion[] => [];

  const [homes, buurten, places] = await Promise.all([
    want('homes') ? searchResidences(query, signal).then(toHomeSuggestions).catch(onError) : none,
    want('buurten')
      ? suggest(query, signal, BUURT_TYPES_FQ).then(toBuurtSuggestions).catch(onError)
      : none,
    want('places')
      ? suggest(query, signal, placesFilter).then(toPlaceSuggestions).catch(onError)
      : none,
  ]);

  return rankSuggestions(dedupeCities([...homes, ...buurten, ...places]), query, origin);
}

/**
 * Resolve a picked suggestion into a {@link SearchResult}. Homes are already
 * resolved; a place or buurt needs one PDOK lookup to fetch its coordinate (and,
 * for a buurt, its CBS codes). Returns `null` when the lookup finds nothing.
 */
export async function resolvePick(
  suggestion: SearchSuggestion,
  signal?: AbortSignal,
): Promise<SearchResult | null> {
  switch (suggestion.kind) {
    case 'residence':
      return { kind: 'residence', listing: suggestion.listing };
    case 'place': {
      const result = await lookup(suggestion.id, signal);
      return result ? { kind: 'place', result } : null;
    }
    case 'buurt': {
      const found = await lookupBuurt(suggestion.id, signal);
      return found ? { kind: 'buurt', ...found } : null;
    }
  }
}

/** Resolve a free-text submit (Enter) to the top matching place. */
export async function resolveTyped(
  text: string,
  signal?: AbortSignal,
): Promise<SearchResult | null> {
  const result = await geocode(text, signal);
  return result ? { kind: 'place', result } : null;
}
