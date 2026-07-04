import type { FillExtrusionLayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Listing } from '@realty/types';

/** Fallback map centre (Amsterdam) when there are no polygons or listings to frame. */
export const DEFAULT_CENTER = { longitude: 4.9041, latitude: 52.3676 } as const;

/**
 * Camera pitch (degrees) applied while 3D buildings are enabled; 0 when off.
 * MapLibre renders pitch as visually flat at the app's default city-wide zoom
 * (~11) regardless of this value — the tilt only becomes apparent once the
 * user zooms in near `BUILDINGS_3D_MIN_ZOOM`, which is also where the
 * extrusion layer itself starts drawing. Confirmed against a bare
 * maplibre-gl-js instance, so this is a library characteristic, not a bug in
 * how the pitch is applied here.
 */
export const BUILDINGS_3D_PITCH = 45;

/** Below this zoom, individual buildings are too small for extrusion to read. */
export const BUILDINGS_3D_MIN_ZOOM = 15;

/**
 * `fill-extrusion` paint for the basemap's OpenMapTiles `building` layer. Both
 * vendored styles carry `render_height`/`render_min_height` on that layer (the
 * schema's precomputed extrusion fields), so no extra source is needed — see
 * `POLYGONS_BEFORE` in `map-style.ts` for the layer this sits alongside.
 */
export function buildings3DPaint(scheme: 'light' | 'dark'): FillExtrusionLayerSpecification['paint'] {
  return {
    'fill-extrusion-color': scheme === 'dark' ? '#52525b' : '#d4d4d8',
    'fill-extrusion-height': ['get', 'render_height'],
    'fill-extrusion-base': ['get', 'render_min_height'],
    'fill-extrusion-opacity': 0.85,
  };
}

/**
 * Compact price shown inside a map marker:
 * - ≥ €1M  → millions with up to 2 decimals, e.g. 1,252,000 → "€1.25M"
 * - ≥ €1k  → thousands, e.g. 450,000 → "€450k"
 * - below  → the raw price.
 */
export function priceLabel(listing: Listing): string {
  const prefix = listing.currency === 'EUR' ? '€' : '';
  const k = Math.round(listing.price / 1000);
  // Once the rounded thousands reach 1000 ("1000k"), show millions instead.
  // Dividing by 10k then by 100 rounds to 2 decimals; Number drops any trailing
  // zeros, so 1,500,000 → "1.5M" and 1,000,000 → "1M".
  if (k >= 1000) {
    const millions = Math.round(listing.price / 10_000) / 100;
    return `${prefix}${millions}M`;
  }
  return k >= 1 ? `${prefix}${k}k` : `${listing.price}`;
}
