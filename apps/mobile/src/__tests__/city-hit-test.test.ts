import type { CityShape } from '@realty/types';

import { buildCityIndex, findCityAt } from '@/lib/city-hit-test';

// A unit square with its lower-left corner at (x0, y0).
const square = (code: string, x0: number, y0: number): CityShape => ({
  code,
  name: `City ${code}`,
  geometry: {
    type: 'Polygon',
    coordinates: [[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]],
  },
});

// A 4×4 square (10..14) with a 2×2 hole in the middle (11..13).
const withHole: CityShape = {
  code: 'HOLE',
  name: 'Holey',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [[10, 10], [14, 10], [14, 14], [10, 14], [10, 10]],
      [[11, 11], [13, 11], [13, 13], [11, 13], [11, 11]],
    ],
  },
};

// Two disjoint unit squares (around 20 and 30).
const multi: CityShape = {
  code: 'MULTI',
  name: 'Two parts',
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]],
      [[[30, 30], [31, 30], [31, 31], [30, 31], [30, 30]]],
    ],
  },
};

const index = buildCityIndex([square('A', 0, 0), square('B', 5, 0), withHole, multi]);

describe('findCityAt', () => {
  it('returns the city whose polygon contains the point', () => {
    expect(findCityAt([0.5, 0.5], index)?.code).toBe('A');
    expect(findCityAt([5.5, 0.5], index)?.code).toBe('B');
  });

  it('returns null outside every city, including gaps between them', () => {
    expect(findCityAt([100, 100], index)).toBeNull();
    expect(findCityAt([3, 0.5], index)).toBeNull(); // in the gap between A and B
  });

  it('treats a hole as outside the city', () => {
    expect(findCityAt([10.5, 10.5], index)?.code).toBe('HOLE'); // in the ring, outside the hole
    expect(findCityAt([12, 12], index)).toBeNull(); // inside the hole
  });

  it('matches any part of a MultiPolygon but not the gap between parts', () => {
    expect(findCityAt([20.5, 20.5], index)?.code).toBe('MULTI');
    expect(findCityAt([30.5, 30.5], index)?.code).toBe('MULTI');
    expect(findCityAt([25, 25], index)).toBeNull();
  });

  it('exposes the bounding box for camera framing', () => {
    expect(findCityAt([0.5, 0.5], index)?.bbox).toEqual([0, 0, 1, 1]);
    // The hole never widens the bbox — only the outer ring counts.
    expect(findCityAt([10.5, 10.5], index)?.bbox).toEqual([10, 10, 14, 14]);
  });
});
