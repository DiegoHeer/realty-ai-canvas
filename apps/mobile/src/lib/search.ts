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

/** A dropdown row before the user commits to it. */
export type SearchSuggestion =
  | { kind: 'place'; id: string; label: string; type: string }
  | { kind: 'buurt'; id: string; label: string; type: string }
  // Homes come back fully resolved from the backend, so they carry the Listing.
  | { kind: 'residence'; id: string; label: string; listing: Listing };

/** Suggestions grouped by section, in display order. */
export interface SearchSuggestions {
  homes: SearchSuggestion[];
  buurten: SearchSuggestion[];
  places: SearchSuggestion[];
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

function toHomeSuggestions(listings: Listing[]): SearchSuggestion[] {
  return listings.map((listing) => ({
    kind: 'residence',
    id: listing.id,
    label: homeLabel(listing),
    listing,
  }));
}

function toBuurtSuggestions(docs: GeocodeSuggestion[]): SearchSuggestion[] {
  return docs
    .slice(0, BUURT_LIMIT)
    .map((doc) => ({ kind: 'buurt', id: doc.id, label: doc.label, type: doc.type }));
}

function toPlaceSuggestions(docs: GeocodeSuggestion[]): SearchSuggestion[] {
  return docs
    .slice(0, PLACE_LIMIT)
    .map((doc) => ({ kind: 'place', id: doc.id, label: doc.label, type: doc.type }));
}

/**
 * Fetch suggestions from every requested source in parallel. Sources fail
 * independently — a slow or erroring source resolves to an empty section rather
 * than sinking the others — matching the bar's "show what we have" behavior.
 */
export async function suggestAll(
  query: string,
  sources: readonly SearchSource[],
  signal?: AbortSignal,
): Promise<SearchSuggestions> {
  const want = (source: SearchSource) => sources.includes(source);
  // Only carve buurt/wijk out of Places when there's a Neighborhoods section to
  // hold them; places-only screens keep PDOK's full, unfiltered result set.
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

  return { homes, buurten, places };
}

/** Total rows across all sections — drives whether the dropdown opens. */
export function suggestionCount(groups: SearchSuggestions): number {
  return groups.homes.length + groups.buurten.length + groups.places.length;
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
