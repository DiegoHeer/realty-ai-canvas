import type {
  DataDrivenPropertyValueSpecification,
  FilterSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import type { AreaPolygon } from '@realty/types';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

type AreaProps = { id: string; name?: string; color: string };

/**
 * Wrap area polygons in a GeoJSON FeatureCollection, carrying each polygon's
 * `color` into feature properties so a single layer can color them via
 * `["get", "color"]`.
 */
export function toFeatureCollection(
  polygons: AreaPolygon[],
): FeatureCollection<Polygon | MultiPolygon, AreaProps> {
  return {
    type: 'FeatureCollection',
    features: polygons.map(
      (p): Feature<Polygon | MultiPolygon, AreaProps> => ({
        type: 'Feature',
        properties: { id: p.id, name: p.name, color: p.color },
        geometry: p.geometry,
      }),
    ),
  };
}

/**
 * Center the camera on the bounding box of all polygons. Returns null when there
 * is nothing to frame so callers can fall back to another center.
 */
export function areasCenter(polygons: AreaPolygon[]): { longitude: number; latitude: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of polygons) {
    // Polygon → Position[][]; MultiPolygon → Position[][][] flattened to rings.
    const rings = p.geometry.type === 'Polygon' ? p.geometry.coordinates : p.geometry.coordinates.flat();
    for (const ring of rings) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX === Infinity) return null;
  return { longitude: (minX + maxX) / 2, latitude: (minY + maxY) / 2 };
}

/** Shared paint constants so web and native render identically. */
export const FILL_OPACITY = 0.4;
export const OUTLINE_WIDTH = .5;
/** The selected polygon gets a denser fill and thicker outline to stand out. */
export const FILL_OPACITY_SELECTED = 0.7;
export const OUTLINE_WIDTH_SELECTED = 3;

/**
 * Paint value for the fill opacity: the polygon whose `id` matches `selectedId`
 * is drawn denser, the rest keep the base opacity. Returns a plain number when
 * nothing is selected so the layer skips the per-feature branch.
 */
export function fillOpacityFor(
  selectedId: string | null | undefined,
): DataDrivenPropertyValueSpecification<number> {
  if (!selectedId) return FILL_OPACITY;
  return ['case', ['==', ['get', 'id'], selectedId], FILL_OPACITY_SELECTED, FILL_OPACITY];
}

/** Paint value for the outline width: the selected polygon gets a bolder line. */
export function outlineWidthFor(
  selectedId: string | null | undefined,
): DataDrivenPropertyValueSpecification<number> {
  if (!selectedId) return OUTLINE_WIDTH;
  return ['case', ['==', ['get', 'id'], selectedId], OUTLINE_WIDTH_SELECTED, OUTLINE_WIDTH];
}

/** White dashed line drawn on top of the selected polygon for extra emphasis. */
export const SELECTED_DASH_COLOR = '#ffffff';
export const SELECTED_DASH_WIDTH = 2;
export const SELECTED_DASH_ARRAY = [2, 2];

/** Layer filter that matches only the polygon with the given id. */
export function selectedFilter(selectedId: string): FilterSpecification {
  return ['==', ['get', 'id'], selectedId];
}

// The layer to insert the polygons below lives in `map-style.ts` as
// `polygonsBeforeId` — it depends on the active basemap.
