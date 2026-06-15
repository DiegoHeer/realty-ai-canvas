import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { useColorScheme } from 'react-native';

import { useAppearance } from '../lib/appearance';
import darkStyle from './dark-style.json';

// Light: OpenMapTiles Positron, hosted keyless by OpenFreeMap (a URL is enough).
// https://github.com/openmaptiles/positron-gl-style
export const MAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';

// Dark: OpenFreeMap's "dark" (dark-matter) style, vendored to `dark-style.json`
// and brightened — every color's HSL lightness is gamma-lifted (L**0.6) so the
// near-black base tones become legible dark grays while the light labels stay put.
export const MAP_STYLE_DARK = darkStyle as unknown as StyleSpecification;

// `beforeId` for the polygon overlays — the layer they insert *below* — which
// must differ per basemap:
//   Light (positron): below `waterway_line_label`, the first symbol layer, so
//     the overlays sit above all base fills/lines but under every label.
//   Dark (dark-matter): below `building`. The vendored `dark-style.json` moves
//     its `building` fill above the road layers, so this puts the overlays over
//     the roads but under the houses. (positron's `waterway_line_label` doesn't
//     even exist in dark-matter, so the id genuinely has to change.)
const POLYGONS_BEFORE_LIGHT = 'waterway_line_label';
const POLYGONS_BEFORE_DARK = 'building';

export interface MapStyleConfig {
  /** Style URL (light) or inline spec (dark) to pass to the Map's `mapStyle`. */
  mapStyle: string | StyleSpecification;
  /** `beforeId` for the polygon layers, matching the active basemap. */
  polygonsBeforeId: string;
}

/**
 * The basemap matching the app's effective theme, driven by the persisted
 * appearance preference (see {@link useAppearance}). `'system'` falls back to
 * the OS color scheme. Dark theme → brightened dark-matter, light → positron.
 */
export function useMapStyle(): MapStyleConfig {
  const colorScheme = useColorScheme();
  const { appearance } = useAppearance();
  const effectiveScheme = appearance === 'system' ? colorScheme : appearance;
  return effectiveScheme === 'dark'
    ? { mapStyle: MAP_STYLE_DARK, polygonsBeforeId: POLYGONS_BEFORE_DARK }
    : { mapStyle: MAP_STYLE_LIGHT, polygonsBeforeId: POLYGONS_BEFORE_LIGHT };
}
