import type { CityShape } from '@realty/types';
import type { Position } from 'geojson';

/** Axis-aligned bounds in WGS84 degrees: [minLng, minLat, maxLng, maxLat]. */
export type Bounds = [number, number, number, number];

/** A city plus its precomputed bounding box, so a tap can skip most polygons. */
export interface CityIndexEntry {
  code: string;
  name: string;
  bbox: Bounds;
  geometry: CityShape['geometry'];
}

/** A geometry's polygons as a flat list (Polygon → 1, MultiPolygon → many). */
function polygonsOf(geometry: CityShape['geometry']): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function boundsOf(geometry: CityShape['geometry']): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rings of polygonsOf(geometry)) {
    // The outer ring (index 0) bounds the polygon; holes sit inside it.
    for (const [x, y] of rings[0]!) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Precompute each city's bounding box once. A tap then ray-casts only the
 * polygons whose bbox contains it (usually one). Cities are loaded once and
 * cached, so this runs only when that list changes.
 */
export function buildCityIndex(cities: CityShape[]): CityIndexEntry[] {
  return cities.map((c) => ({
    code: c.code,
    name: c.name,
    bbox: boundsOf(c.geometry),
    geometry: c.geometry,
  }));
}

/** Standard ray-casting test for a point against a single linear ring. */
function pointInRing(x: number, y: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside a polygon = inside its outer ring and outside every hole. */
function pointInPolygon(x: number, y: number, rings: Position[][]): boolean {
  if (rings.length === 0 || !pointInRing(x, y, rings[0]!)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(x, y, rings[i]!)) return false; // landed in a hole
  }
  return true;
}

/**
 * The city whose shape contains the point `[lng, lat]`, or null. Cities don't
 * overlap, so the first containing shape is the answer. The cheap bbox check
 * rejects nearly every city before the heavier ray-cast runs.
 */
export function findCityAt(point: Position, index: CityIndexEntry[]): CityIndexEntry | null {
  const x = point[0]!;
  const y = point[1]!;
  for (const city of index) {
    const [minX, minY, maxX, maxY] = city.bbox;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    if (polygonsOf(city.geometry).some((rings) => pointInPolygon(x, y, rings))) return city;
  }
  return null;
}
