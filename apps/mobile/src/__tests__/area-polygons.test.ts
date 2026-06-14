import type { AreaPolygon } from '@realty/types';

import { areasCenter, FILL_OPACITY, OUTLINE_WIDTH, toFeatureCollection } from '@/components/area-polygons';

function makePolygon(coords: [number, number][], color = '#ff0000'): AreaPolygon {
  return {
    id: `area-${Math.random().toString(36).slice(2)}`,
    name: 'Test Area',
    color,
    geometry: {
      type: 'Polygon',
      coordinates: [coords.map(([lng, lat]) => [lng, lat])],
    },
  };
}

function makeMultiPolygon(rings: [number, number][][], color = '#00ff00'): AreaPolygon {
  return {
    id: `area-${Math.random().toString(36).slice(2)}`,
    name: 'Multi Area',
    color,
    geometry: {
      type: 'MultiPolygon',
      coordinates: rings.map((ring) => [ring.map(([lng, lat]) => [lng, lat])]),
    },
  };
}

describe('toFeatureCollection', () => {
  it('wraps polygons into a valid GeoJSON FeatureCollection', () => {
    const polygon = makePolygon([[4.0, 52.0], [4.1, 52.0], [4.1, 52.1], [4.0, 52.1], [4.0, 52.0]]);
    const fc = toFeatureCollection([polygon]);

    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.type).toBe('Feature');
    expect(fc.features[0]!.properties.color).toBe('#ff0000');
    expect(fc.features[0]!.properties.id).toBe(polygon.id);
    expect(fc.features[0]!.properties.name).toBe('Test Area');
    expect(fc.features[0]!.geometry).toBe(polygon.geometry);
  });

  it('returns empty features for empty input', () => {
    const fc = toFeatureCollection([]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toEqual([]);
  });

  it('handles multiple polygons', () => {
    const polygons = [
      makePolygon([[4.0, 52.0], [4.1, 52.0], [4.1, 52.1], [4.0, 52.0]], '#ff0000'),
      makePolygon([[5.0, 53.0], [5.1, 53.0], [5.1, 53.1], [5.0, 53.0]], '#0000ff'),
    ];
    const fc = toFeatureCollection(polygons);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties.color).toBe('#ff0000');
    expect(fc.features[1]!.properties.color).toBe('#0000ff');
  });
});

describe('areasCenter', () => {
  it('returns midpoint of a single polygon bounding box', () => {
    const polygon = makePolygon([
      [4.0, 52.0], [4.2, 52.0], [4.2, 52.2], [4.0, 52.2], [4.0, 52.0],
    ]);
    const center = areasCenter([polygon]);
    expect(center).not.toBeNull();
    expect(center!.longitude).toBeCloseTo(4.1, 5);
    expect(center!.latitude).toBeCloseTo(52.1, 5);
  });

  it('returns midpoint spanning multiple polygons', () => {
    const p1 = makePolygon([[4.0, 52.0], [4.2, 52.0], [4.2, 52.2], [4.0, 52.2], [4.0, 52.0]]);
    const p2 = makePolygon([[5.0, 53.0], [5.2, 53.0], [5.2, 53.2], [5.0, 53.2], [5.0, 53.0]]);
    const center = areasCenter([p1, p2]);
    expect(center).not.toBeNull();
    expect(center!.longitude).toBeCloseTo(4.6, 5);
    expect(center!.latitude).toBeCloseTo(52.6, 5);
  });

  it('returns null for empty input', () => {
    expect(areasCenter([])).toBeNull();
  });

  it('handles MultiPolygon geometries', () => {
    const mp = makeMultiPolygon([
      [[4.0, 52.0], [4.2, 52.0], [4.2, 52.2], [4.0, 52.2], [4.0, 52.0]],
      [[5.0, 53.0], [5.2, 53.0], [5.2, 53.2], [5.0, 53.2], [5.0, 53.0]],
    ]);
    const center = areasCenter([mp]);
    expect(center).not.toBeNull();
    expect(center!.longitude).toBeCloseTo(4.6, 5);
    expect(center!.latitude).toBeCloseTo(52.6, 5);
  });
});

describe('paint constants', () => {
  it('exports expected fill opacity', () => {
    expect(FILL_OPACITY).toBe(0.4);
  });

  it('exports expected outline width', () => {
    expect(OUTLINE_WIDTH).toBe(0.5);
  });
});
