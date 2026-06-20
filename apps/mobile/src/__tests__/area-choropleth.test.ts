import type { AreaPolygon, NeighborhoodStats } from '@realty/types';

import {
  colorAreasByStat,
  interpolateRamp,
  outlineColorFor,
  selectInhabitants,
} from '@/lib/area-choropleth';
import { RAW_FIELDS } from '@/lib/neighborhood-stats';

// Ramp endpoints, asserted directly so a ramp change is a deliberate test edit.
const LIGHT_LOW = '#eff6ff'; // few inhabitants → almost white
const LIGHT_HIGH = '#1e3a8a'; // many inhabitants → dark blue
const DARK_LOW = '#172554'; // few → deep, near the dark basemap
const DARK_HIGH = '#bfdbfe'; // many → bright
const NO_DATA_LIGHT = '#cbd5e1';
const NO_DATA_DARK = '#475569';

function area(id: string): AreaPolygon {
  return {
    id,
    name: `name-${id}`,
    color: '#000000', // placeholder the choropleth must overwrite
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  };
}

function stat(code: string, inhabitants: number | null): NeighborhoodStats {
  return {
    code,
    statsYear: 2023,
    stats: inhabitants == null ? {} : { [RAW_FIELDS.inhabitants]: inhabitants },
  };
}

function statsMap(...entries: NeighborhoodStats[]): Map<string, NeighborhoodStats> {
  return new Map(entries.map((s) => [s.code, s]));
}

describe('interpolateRamp', () => {
  it('returns the first stop at t=0 and the last at t=1', () => {
    const ramp = ['#000000', '#ffffff'];
    expect(interpolateRamp(ramp, 0)).toBe('#000000');
    expect(interpolateRamp(ramp, 1)).toBe('#ffffff');
  });

  it('blends linearly at the midpoint of a two-stop ramp', () => {
    expect(interpolateRamp(['#000000', '#ffffff'], 0.5)).toBe('#808080');
  });

  it('clamps out-of-range t to the ramp ends', () => {
    const ramp = ['#000000', '#ffffff'];
    expect(interpolateRamp(ramp, -1)).toBe('#000000');
    expect(interpolateRamp(ramp, 2)).toBe('#ffffff');
  });

  it('samples the correct segment of a multi-stop ramp', () => {
    // Three evenly spaced stops: t=0.5 lands exactly on the middle stop.
    expect(interpolateRamp(['#000000', '#112233', '#ffffff'], 0.5)).toBe('#112233');
  });
});

describe('selectInhabitants', () => {
  it('reads the CBS inhabitants field', () => {
    expect(selectInhabitants(stat('x', 4200))).toBe(4200);
  });

  it('is null when the field is suppressed/absent', () => {
    expect(selectInhabitants(stat('x', null))).toBeNull();
  });
});

describe('outlineColorFor', () => {
  it('returns a theme-appropriate constant', () => {
    expect(outlineColorFor('light')).toBe('#1e3a8a');
    expect(outlineColorFor('dark')).toBe('#bfdbfe');
  });
});

describe('colorAreasByStat', () => {
  it('shades the min light and the max dark in the light theme', () => {
    const areas = [area('a'), area('b'), area('c')];
    const stats = statsMap(stat('a', 1000), stat('b', 9000), stat('c', 5000));

    const [a, b, c] = colorAreasByStat(areas, stats, { scheme: 'light' });

    expect(a!.color).toBe(LIGHT_LOW); // fewest inhabitants
    expect(b!.color).toBe(LIGHT_HIGH); // most inhabitants
    // The middle area sits strictly between the two ends.
    expect(c!.color).not.toBe(LIGHT_LOW);
    expect(c!.color).not.toBe(LIGHT_HIGH);
  });

  it('inverts lightness in the dark theme (more = brighter)', () => {
    const areas = [area('a'), area('b')];
    const stats = statsMap(stat('a', 1000), stat('b', 9000));

    const [a, b] = colorAreasByStat(areas, stats, { scheme: 'dark' });

    expect(a!.color).toBe(DARK_LOW); // fewest → deep
    expect(b!.color).toBe(DARK_HIGH); // most → bright
  });

  it('normalizes only across the areas passed in (one municipality)', () => {
    // Same absolute count (5000) lands at opposite ends depending on its peers.
    const lowPeer = colorAreasByStat([area('x'), area('y')], statsMap(stat('x', 5000), stat('y', 9000)), {
      scheme: 'light',
    });
    const highPeer = colorAreasByStat([area('x'), area('y')], statsMap(stat('x', 1000), stat('y', 5000)), {
      scheme: 'light',
    });
    expect(lowPeer[0]!.color).toBe(LIGHT_LOW); // 5000 is the smallest here
    expect(highPeer[1]!.color).toBe(LIGHT_HIGH); // 5000 is the largest here
  });

  it('uses the neutral no-data color when stats are missing or suppressed', () => {
    const areas = [area('present'), area('suppressed'), area('absent')];
    // 'absent' has no entry in the map at all; 'suppressed' has an empty record.
    const stats = statsMap(stat('present', 5000), stat('suppressed', null));

    const light = colorAreasByStat(areas, stats, { scheme: 'light' });
    expect(light[1]!.color).toBe(NO_DATA_LIGHT);
    expect(light[2]!.color).toBe(NO_DATA_LIGHT);

    const dark = colorAreasByStat(areas, stats, { scheme: 'dark' });
    expect(dark[1]!.color).toBe(NO_DATA_DARK);
    expect(dark[2]!.color).toBe(NO_DATA_DARK);
  });

  it('places a single (or all-equal) municipality at the middle of the ramp', () => {
    const single = colorAreasByStat([area('only')], statsMap(stat('only', 5000)), { scheme: 'light' });
    const allEqual = colorAreasByStat([area('a'), area('b')], statsMap(stat('a', 5000), stat('b', 5000)), {
      scheme: 'light',
    });
    const mid = interpolateRamp(['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'], 0.5);
    expect(single[0]!.color).toBe(mid);
    expect(allEqual[0]!.color).toBe(mid);
    expect(allEqual[1]!.color).toBe(mid);
  });

  it('preserves id, name and geometry, replacing only the color', () => {
    const [out] = colorAreasByStat([area('keep')], statsMap(stat('keep', 5000)), { scheme: 'light' });
    expect(out!.id).toBe('keep');
    expect(out!.name).toBe('name-keep');
    expect(out!.geometry).toEqual(area('keep').geometry);
    expect(out!.color).not.toBe('#000000');
  });

  it('honors a custom statistic selector', () => {
    const areas = [area('a'), area('b')];
    const stats = statsMap(
      { code: 'a', statsYear: 2023, stats: { Custom_1: 10 } },
      { code: 'b', statsYear: 2023, stats: { Custom_1: 90 } },
    );
    const selectValue = (s: NeighborhoodStats) => s.stats.Custom_1 ?? null;

    const [a, b] = colorAreasByStat(areas, stats, { scheme: 'light', selectValue });
    expect(a!.color).toBe(LIGHT_LOW);
    expect(b!.color).toBe(LIGHT_HIGH);
  });
});
