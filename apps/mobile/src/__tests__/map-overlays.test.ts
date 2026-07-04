import {
  BUILDING_AGE_FILL,
  MAP_OVERLAYS,
  overlayById,
  type OverlayId,
} from '@/lib/map-overlays';

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

  it('pins the BAG building tiles to the only published tile matrix (17)', () => {
    const buildings = MAP_OVERLAYS.find((o) => o.kind === 'buildings')!;
    expect(buildings.minzoom).toBe(17);
    expect(buildings.maxzoom).toBe(17);
    // OGC API tiles address {tileMatrix}/{tileRow}/{tileCol} = z/y/x.
    expect(buildings.tiles[0]).toContain('/{z}/{y}/{x}');
  });

  it('colors every building-age legend bucket from the fill expression', () => {
    const buildings = MAP_OVERLAYS.find((o) => o.kind === 'buildings')!;
    const expressionColors = BUILDING_AGE_FILL.filter(
      (part) => typeof part === 'string' && part.startsWith('#'),
    );
    expect(buildings.legend.map((e) => e.color)).toEqual(expressionColors);
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
