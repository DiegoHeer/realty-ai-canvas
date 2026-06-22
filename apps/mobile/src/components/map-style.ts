import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { useColorScheme } from 'react-native';

import { useAppearance } from '../lib/appearance';
import darkStyle from './dark-style.json';
import lightStyle from './positron-style.json';

// Light: OpenMapTiles Positron, vendored to `positron-style.json` from
// OpenFreeMap (its sources/sprite/glyphs are already keyless) and recolored —
// greenery (parks, woods) to #c4e0c9 and water (sea/lake fills + river lines)
// to #cee0e5. Vendored rather than referenced by URL so those colors can be
// edited. https://github.com/openmaptiles/positron-gl-style
export const MAP_STYLE_LIGHT = lightStyle as unknown as StyleSpecification;

// Dark: OpenFreeMap's "dark" (dark-matter) style, vendored to `dark-style.json`
// and brightened — every color's HSL lightness is gamma-lifted (L**0.6) so the
// near-black base tones become legible dark grays while the light labels stay
// put. Greenery and water are then rendered exactly like the light theme: the
// same colors (greenery #c4e0c9, water/rivers #c0dce3) and the same layer setup
// — a `park` source-layer fill drawn *under* water (so parks never bleed green
// over it), plus a plain green wood fill (no pattern). dark-matter natively
// lacks the `park` fill and patterns its woods, so those are added/changed here
// to match positron.
export const MAP_STYLE_DARK = darkStyle as unknown as StyleSpecification;

// `beforeId` for the polygon overlays — the layer they insert *below*. In both
// vendored basemaps the `building` fill sits just under the first label layer,
// above every road and boundary line. Inserting the overlays beneath it puts
// the colored tiles above all roads and base fills, yet below the buildings and
// every text label. (dark-matter ships this order; positron's `building` was
// moved up from its stock spot beneath the roads to match — see
// positron-style.json.)
const POLYGONS_BEFORE = 'building';

export interface MapStyleConfig {
  /** Style URL (light) or inline spec (dark) to pass to the Map's `mapStyle`. */
  mapStyle: string | StyleSpecification;
  /** `beforeId` for the polygon layers, matching the active basemap. */
  polygonsBeforeId: string;
  /** The resolved theme, so callers can pick theme-aware overlay colors. */
  scheme: 'light' | 'dark';
}

/**
 * The app's effective theme, driven by the persisted appearance preference (see
 * {@link useAppearance}). `'system'` falls back to the OS color scheme. Shared
 * by the basemap ({@link useMapStyle}) and the choropleth overlay so both stay
 * in lock-step from a single source of truth.
 */
export function useEffectiveColorScheme(): 'light' | 'dark' {
  const colorScheme = useColorScheme();
  const { appearance } = useAppearance();
  const effective = appearance === 'system' ? colorScheme : appearance;
  return effective === 'dark' ? 'dark' : 'light';
}

/**
 * The basemap matching the app's effective theme. Dark theme → brightened
 * dark-matter, light → positron. Also returns the resolved `scheme` so the
 * overlay layers can match it without re-deriving the theme.
 */
export function useMapStyle(): MapStyleConfig {
  const scheme = useEffectiveColorScheme();
  const mapStyle = scheme === 'dark' ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
  return { mapStyle, polygonsBeforeId: POLYGONS_BEFORE, scheme };
}
