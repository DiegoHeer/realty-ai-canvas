import type { BuildingType, Listing } from '@realty/types';
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
  /** Minimum acceptable energy label, e.g. "C" keeps A/B/C; null = any. */
  minEnergyLabel: string | null;
  /** Keep listings built in/after this year; null = any. */
  minBuildYear: number | null;
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
  minEnergyLabel: null,
  minBuildYear: null,
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

/** Slider domain for price; rent and buy live on very different scales. */
export function priceDomain(mode: ListingMode): { min: number; max: number; step: number } {
  return mode === 'rent'
    ? { min: 0, max: 5000, step: 50 }
    : { min: 0, max: 3_000_000, step: 25_000 };
}

export const AREA_DOMAIN = { min: 0, max: 300, step: 5 } as const;
export const YEAR_DOMAIN = { min: 1900, max: 2025, step: 5 } as const;

// Mock "availability" histograms shown behind the price slider — a plausible
// right-skewed shape per mode. Bucketed evenly across the price domain. Replace
// with real per-bucket counts once the API exposes them.
export const PRICE_DISTRIBUTION_BUY = [
  2, 5, 9, 14, 20, 26, 30, 28, 24, 19, 15, 12, 9, 7, 5, 4, 3, 2, 1, 1,
];
export const PRICE_DISTRIBUTION_RENT = [
  3, 8, 15, 22, 28, 30, 27, 21, 16, 11, 8, 5, 4, 3, 2, 2, 1, 1, 1, 1,
];

/** Rank of an energy label (0 = best). Unknown/absent ranks worst. */
export function energyRank(label: string | null | undefined): number {
  if (!label) return Number.POSITIVE_INFINITY;
  const i = (ENERGY_LABELS as readonly string[]).indexOf(label);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

/** Parse a 4-digit year out of a free-form construction period ("1973"). */
function parseYear(period: string | undefined): number | null {
  if (!period) return null;
  const match = period.match(/\d{4}/);
  return match ? Number.parseInt(match[0], 10) : null;
}

/**
 * Number of facets that differ from the default (unfiltered) state. Price and
 * area each count once whether their min, max, or both are set. Drives the count
 * badge on the search bar's filters button.
 */
export function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.mode !== DEFAULT_FILTERS.mode) n++;
  if (f.minPrice !== null || f.maxPrice !== null) n++;
  if (f.propertyTypes.length > 0) n++;
  if (f.minBedrooms > 0) n++;
  if (f.minBathrooms > 0) n++;
  if (f.minAreaSqm !== null || f.maxAreaSqm !== null) n++;
  if (f.minEnergyLabel !== null) n++;
  if (f.minBuildYear !== null) n++;
  return n;
}

/** Apply the filters to a list of listings, returning those that match. */
export function applyFilters(listings: Listing[], f: Filters): Listing[] {
  return listings.filter((l) => {
    if (f.mode === 'rent' ? l.status !== 'for_rent' : l.status === 'for_rent') return false;
    if (f.minPrice !== null && l.price < f.minPrice) return false;
    if (f.maxPrice !== null && l.price > f.maxPrice) return false;
    if (f.propertyTypes.length > 0 && (!l.buildingType || !f.propertyTypes.includes(l.buildingType)))
      return false;
    if (l.bedrooms < f.minBedrooms) return false;
    if (l.bathrooms < f.minBathrooms) return false;
    if (f.minAreaSqm !== null && l.areaSqm < f.minAreaSqm) return false;
    if (f.maxAreaSqm !== null && l.areaSqm > f.maxAreaSqm) return false;
    if (f.minEnergyLabel !== null && energyRank(l.energyLabel) > energyRank(f.minEnergyLabel))
      return false;
    if (f.minBuildYear !== null) {
      const year = parseYear(l.constructionPeriod);
      if (year === null || year < f.minBuildYear) return false;
    }
    return true;
  });
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
