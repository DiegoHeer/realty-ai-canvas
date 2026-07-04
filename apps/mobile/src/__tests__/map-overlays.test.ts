import { MAP_OVERLAYS, overlayById, type OverlayId } from '@/lib/map-overlays';

/** Every '#rrggbb' literal inside a (possibly nested) style expression. */
const expressionColors = (expr: unknown): string[] =>
  Array.isArray(expr)
    ? expr.flatMap(expressionColors)
    : typeof expr === 'string' && expr.startsWith('#')
      ? [expr]
      : [];

describe('MAP_OVERLAYS registry', () => {
  it('has unique ids', () => {
    const ids = MAP_OVERLAYS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every raster overlay a MapLibre-consumable WMS template', () => {
    for (const o of MAP_OVERLAYS.filter((o) => o.kind === 'raster')) {
      for (const url of o.tiles) {
        // The bbox token is what turns a GetMap URL into a tile template.
        expect(url).toContain('bbox={bbox-epsg-3857}');
        expect(url).toContain('crs=EPSG:3857');
        // PDOK's Mapserver errors without an explicit (empty) styles param.
        expect(url).toContain('styles=');
        // Width/height must match the 512px tileSize the sources are given.
        expect(url).toContain('width=512');
        expect(url).toContain('height=512');
      }
    }
  });

  it('gives every buildings overlay XYZ tiles, a source-layer and a fill', () => {
    const buildings = MAP_OVERLAYS.filter((o) => o.kind === 'buildings');
    expect(buildings.length).toBeGreaterThan(0);
    for (const o of buildings) {
      expect(o.tiles[0]).toContain('/{z}/{x}/{y}');
      expect(o.sourceLayer).toBeTruthy();
      // Every color the fill expression can produce is explained by a legend
      // swatch, and vice versa.
      expect(new Set(expressionColors(o.fillColor))).toEqual(
        new Set(o.legend.map((e) => e.color)),
      );
    }
  });

  it('gives every overlay a non-empty legend', () => {
    for (const o of MAP_OVERLAYS) {
      expect(o.legend.length).toBeGreaterThan(0);
      for (const entry of o.legend) {
        expect(entry.color).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it('looks up overlays by id, tolerating null', () => {
    expect(overlayById('noise')?.id).toBe('noise');
    expect(overlayById(null)).toBeNull();
    expect(overlayById('nope' as OverlayId)).toBeNull();
  });
});
