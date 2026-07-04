import type { BuildingType, ListingQuery, SortOption } from '@realty/types';
import { useSyncExternalStore } from 'react';

import { loadJSON, saveJSON, StorageKeys } from './storage';

/** Whether the user is searching to buy or to rent. */
export type ListingMode = 'buy' | 'rent';

/**
 * The map search filters. `null`/empty/0 each mean "no constraint" for that
 * facet, so {@link DEFAULT_FILTERS} is the unfiltered state. Persisted as-is to
 * AsyncStorage (see the store below) so a search survives an app restart.
 */
export interface Filters {
  mode: ListingMode;
  minPrice: number | null;
  maxPrice: number | null;
  /** Selected building types; empty = any. */
  propertyTypes: BuildingType[];
  /** Minimum bedrooms / bathrooms; 0 = any. */
  minBedrooms: number;
  minBathrooms: number;
  minAreaSqm: number | null;
  maxAreaSqm: number | null;
  /** Accepted energy labels; empty = any. */
  energyLabels: string[];
  /** Keep listings built in/after this year; null = any. */
  minBuildYear: number | null;
  /** Result ordering applied to the map/list query. */
  sort: SortOption;
}

export const DEFAULT_FILTERS: Filters = {
  mode: 'buy',
  minPrice: null,
  maxPrice: null,
  propertyTypes: [],
  minBedrooms: 0,
  minBathrooms: 0,
  minAreaSqm: null,
  maxAreaSqm: null,
  energyLabels: [],
  minBuildYear: null,
  sort: 'newest',
};

/** Building types, in the order they're shown as pills. */
export const BUILDING_TYPES: readonly BuildingType[] = [
  'apartment',
  'terraced',
  'corner',
  'semi_detached',
  'detached',
];

/** Energy labels, best → worst. Index doubles as the rank used for filtering. */
export const ENERGY_LABELS = ['A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

/**
 * Sort options exposed in the filters UI, in display order. Labels are i18n
 * (`filtersPage.sortOptions.<value>`). A curated subset of {@link SortOption}.
 */
export const SORT_OPTIONS: readonly SortOption[] = [
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'area_desc',
  'price_per_m2_asc',
];

// Expand [upper bound, step] segments into the full list of stops, starting at 0.
function priceLadder(segments: readonly (readonly [number, number])[]): number[] {
  const stops = [0];
  for (const [upTo, step] of segments) {
    for (let v = stops[stops.length - 1] + step; v <= upTo; v += step) stops.push(v);
  }
  return stops;
}

/**
 * Price slider stops — a piecewise approximation of a log scale: fine steps
 * across the busy low/mid range, progressively bigger leaps toward the top, so
 * equal thumb travel covers €200k–€400k as comfortably as €2M–€3M. The slider
 * operates on stop *indices*; both thumbs at the ends mean "no constraint",
 * and the topmost stop doubles as the open-ended "€5M+" / "€5000+" position.
 */
export const PRICE_STEPS_BUY: readonly number[] = priceLadder([
  [500_000, 25_000],
  [1_000_000, 50_000],
  [2_000_000, 100_000],
  [3_000_000, 250_000],
  [5_000_000, 500_000],
]);

export const PRICE_STEPS_RENT: readonly number[] = priceLadder([
  [800, 100],
  [2_000, 50],
  [3_000, 100],
  [5_000, 250],
]);

/** The price slider's stops for a mode; rent and buy live on very different scales. */
export function priceSteps(mode: ListingMode): readonly number[] {
  return mode === 'rent' ? PRICE_STEPS_RENT : PRICE_STEPS_BUY;
}

/** Index of the stop closest to `value` — snaps persisted prices onto the ladder. */
export function nearestPriceIndex(steps: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < steps.length; i++) {
    if (Math.abs(steps[i] - value) < Math.abs(steps[best] - value)) best = i;
  }
  return best;
}

export const AREA_DOMAIN = { min: 0, max: 300, step: 5 } as const;
export const YEAR_DOMAIN = { min: 1900, max: 2025, step: 5 } as const;

// Mock "availability" histograms shown behind the price slider — a plausible
// right-skewed shape per mode. Bucketed evenly across the slider track (so on
// the log-ish ladder each bucket spans a widening price band). Replace with
// real per-bucket counts once the API exposes them.
export const PRICE_DISTRIBUTION_BUY = [
  2, 5, 9, 14, 20, 26, 30, 28, 24, 19, 15, 12, 9, 7, 5, 4, 3, 2, 1, 1,
];
export const PRICE_DISTRIBUTION_RENT = [
  3, 8, 15, 22, 28, 30, 27, 21, 16, 11, 8, 5, 4, 3, 2, 2, 1, 1, 1, 1,
];

/**
 * Number of facets that differ from the default (unfiltered) state. Price and
 * area each count once whether their min, max, or both are set. Sort is an
 * ordering, not a filter, so it's excluded. Drives the count badge on the search
 * bar's filters button.
 */
export function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.mode !== DEFAULT_FILTERS.mode) n++;
  if (f.minPrice !== null || f.maxPrice !== null) n++;
  if (f.propertyTypes.length > 0) n++;
  if (f.minBedrooms > 0) n++;
  if (f.minBathrooms > 0) n++;
  if (f.minAreaSqm !== null || f.maxAreaSqm !== null) n++;
  if (f.energyLabels.length > 0) n++;
  if (f.minBuildYear !== null) n++;
  return n;
}

/**
 * Flatten the UI {@link Filters} into a {@link ListingQuery} the data layer
 * sends to `GET /v1/residences`. `null`/empty/`0` ("any") become omitted params
 * (no constraint); buy/rent maps to `deal_type`. The server applies the
 * filtering — there is no client-side fallback pass.
 */
export function filtersToQuery(f: Filters): ListingQuery {
  return {
    dealType: f.mode === 'rent' ? 'rent' : 'sale',
    minPrice: f.minPrice ?? undefined,
    maxPrice: f.maxPrice ?? undefined,
    buildingTypes: f.propertyTypes.length > 0 ? f.propertyTypes : undefined,
    minBedrooms: f.minBedrooms > 0 ? f.minBedrooms : undefined,
    minBathrooms: f.minBathrooms > 0 ? f.minBathrooms : undefined,
    minAreaSqm: f.minAreaSqm ?? undefined,
    maxAreaSqm: f.maxAreaSqm ?? undefined,
    energyLabels: f.energyLabels.length > 0 ? f.energyLabels : undefined,
    minBuildYear: f.minBuildYear ?? undefined,
    sort: f.sort,
  };
}

// --- Store -----------------------------------------------------------------
// In-memory source of truth mirrored to AsyncStorage, surfaced via
// useSyncExternalStore — the same shape as lib/appearance.ts. The Filters page
// is a separate route, so it can't share React state with the map screen;
// this module-level store is what keeps both (and the badge) in lock-step.

let current: Filters = DEFAULT_FILTERS;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setFilters(next: Filters) {
  current = next;
  void saveJSON(StorageKeys.filters, next);
  emit();
}

export function resetFilters() {
  setFilters(DEFAULT_FILTERS);
}

let hydrated = false;

/** Load saved filters and apply them. Safe to call repeatedly; runs once. */
export async function hydrateFilters() {
  if (hydrated) return;
  hydrated = true;
  const stored = await loadJSON<Partial<Filters>>(StorageKeys.filters);
  if (stored) {
    // Merge over defaults so a stored blob from an older shape stays valid.
    current = { ...DEFAULT_FILTERS, ...stored };
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return current;
}

export function useFilters() {
  const filters = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { filters, setFilters, resetFilters };
}

// Hydrate as soon as the module is first imported (the map screen imports it).
void hydrateFilters();
