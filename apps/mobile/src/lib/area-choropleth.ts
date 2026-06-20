import type { AreaPolygon, NeighborhoodStats } from '@realty/types';

import { RAW_FIELDS } from './neighborhood-stats';

/**
 * Choropleth coloring for the neighborhood overlays: each polygon's fill is
 * shaded by a statistic (number of inhabitants, for now) relative to the other
 * neighborhoods of the SAME municipality. The app loads one municipality's
 * areas at a time (e.g. Den Haag `0518`), so the comparison set is just the
 * areas passed in — the min→max is taken across them.
 *
 * Light theme: few inhabitants → almost-white blue, many → dark blue, so the
 * busier neighborhoods read as "heavier" on the light basemap. Dark theme
 * inverts the lightness (few → deep near-background blue, many → bright blue) so
 * the busier areas still stand out against a dark map. Swapping the statistic
 * later is a one-liner: pass a different {@link AreaStatSelector}.
 */

export type ChoroplethScheme = 'light' | 'dark';

/**
 * Sequential blue ramps, ordered low→high value. The light ramp runs
 * almost-white → dark blue (Tailwind blue-50…blue-900); the dark ramp runs deep
 * → bright (blue-950…blue-200) so "more" is always the more prominent end on
 * its basemap. Stops are sampled continuously, so the gradient is smooth.
 */
const RAMP_LIGHT = ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'];
const RAMP_DARK = ['#172554', '#1e40af', '#2563eb', '#60a5fa', '#bfdbfe'];

/** Neutral fill for neighborhoods whose statistic CBS suppressed (no data). */
const NO_DATA_LIGHT = '#cbd5e1';
const NO_DATA_DARK = '#475569';

/**
 * One consistent, legible outline for every overlay — the fill alone encodes
 * the value, so the boundary stays visible even where the fill is near-white
 * (light theme) or near-background (dark theme).
 */
const OUTLINE_LIGHT = '#1e3a8a';
const OUTLINE_DARK = '#bfdbfe';

/** Outline color for the area overlays, matching the active basemap theme. */
export function outlineColorFor(scheme: ChoroplethScheme): string {
  return scheme === 'dark' ? OUTLINE_DARK : OUTLINE_LIGHT;
}

/** Read a finite number, treating `null`/missing/`NaN` as absent. */
function numOrNull(v: number | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Pulls the statistic to shade by out of a neighborhood's raw CBS record. */
export type AreaStatSelector = (stats: NeighborhoodStats) => number | null;

/** Default statistic: number of inhabitants (CBS `AantalInwoners`). */
export const selectInhabitants: AreaStatSelector = (stats) =>
  numOrNull(stats.stats[RAW_FIELDS.inhabitants]);

/** Parse `#rrggbb` into an `[r, g, b]` triple (0–255). */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (n: number): string => Math.round(n).toString(16).padStart(2, '0');

/**
 * Sample a multi-stop ramp at `t` ∈ [0, 1] with piecewise-linear RGB blending.
 * `t` is clamped, so out-of-range inputs saturate at the ramp's ends.
 */
export function interpolateRamp(stops: string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const lastStop = stops.length - 1;
  const pos = clamped * lastStop;
  const i = Math.min(lastStop - 1, Math.floor(pos));
  const f = pos - i;
  const [r1, g1, b1] = hexToRgb(stops[i]!);
  const [r2, g2, b2] = hexToRgb(stops[i + 1]!);
  return `#${toHex(r1 + (r2 - r1) * f)}${toHex(g1 + (g2 - g1) * f)}${toHex(b1 + (b2 - b1) * f)}`;
}

export interface ChoroplethOptions {
  /** Active basemap theme — selects the ramp + no-data color. */
  scheme: ChoroplethScheme;
  /** Which statistic to shade by. Defaults to {@link selectInhabitants}. */
  selectValue?: AreaStatSelector;
}

/**
 * Return the areas with their `color` replaced by a choropleth fill: each
 * polygon shaded by its statistic relative to the min/max across the passed set
 * (one municipality). Areas with no matching stats entry, or a suppressed
 * value, get the neutral no-data color. Geometry, `id` and `name` are preserved.
 * Pure — the map renders the result unchanged via `["get", "color"]`.
 */
export function colorAreasByStat(
  areas: AreaPolygon[],
  statsByCode: Map<string, NeighborhoodStats>,
  { scheme, selectValue = selectInhabitants }: ChoroplethOptions,
): AreaPolygon[] {
  const ramp = scheme === 'dark' ? RAMP_DARK : RAMP_LIGHT;
  const noData = scheme === 'dark' ? NO_DATA_DARK : NO_DATA_LIGHT;

  // Resolve every area's value up front so min/max span the whole municipality.
  const values = areas.map((area) => {
    const stats = statsByCode.get(area.id);
    return stats ? selectValue(stats) : null;
  });

  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v == null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;

  return areas.map((area, i) => {
    const v = values[i];
    if (v == null) return { ...area, color: noData };
    // A single value (or all-equal municipality) has no spread to show — sit at
    // the middle of the ramp rather than implying an extreme.
    const t = span > 0 ? (v - min) / span : 0.5;
    return { ...area, color: interpolateRamp(ramp, t) };
  });
}
