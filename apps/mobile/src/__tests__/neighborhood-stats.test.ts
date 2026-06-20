import type { NeighborhoodStats } from '@realty/types';

import { deriveNeighborhoodStats, RAW_FIELDS } from '@/lib/neighborhood-stats';

/** Build a NeighborhoodStats wrapper around a raw `{ field: value }` map. */
function makeStats(stats: Record<string, number>): NeighborhoodStats {
  return { code: 'BU05180546', statsYear: 2023, stats };
}

// A subset of Archipelbuurt's (code BU05180546) real 0518 values, including the
// genuinely-suppressed district-heating field.
const archipel = makeStats({
  [RAW_FIELDS.inhabitants]: 6285,
  [RAW_FIELDS.households]: 3545,
  [RAW_FIELDS.dwellings]: 3728,
  [RAW_FIELDS.wozValue]: 639,
  [RAW_FIELDS.age0to15]: 750,
  [RAW_FIELDS.age15to25]: 665,
  [RAW_FIELDS.age25to45]: 1510,
  [RAW_FIELDS.age45to65]: 1885,
  [RAW_FIELDS.age65plus]: 1480,
  [RAW_FIELDS.singlePerson]: 1960,
  [RAW_FIELDS.withoutChildren]: 835,
  [RAW_FIELDS.withChildren]: 745,
  [RAW_FIELDS.householdSize]: 1.8,
  [RAW_FIELDS.tenureOwner]: 54,
  [RAW_FIELDS.tenureCorporation]: 14,
  [RAW_FIELDS.tenureOther]: 31,
  [RAW_FIELDS.singleFamily]: 25,
  [RAW_FIELDS.multiFamily]: 75,
  [RAW_FIELDS.originNL]: 3265,
  [RAW_FIELDS.originEurope]: 1415,
  [RAW_FIELDS.originOutsideEurope]: 1600,
  [RAW_FIELDS.before2000]: 94,
  [RAW_FIELDS.from2000]: 6,
  [RAW_FIELDS.incomePerInhabitant]: 59.6,
  [RAW_FIELDS.standardizedHouseholdIncome]: 63.0,
  [RAW_FIELDS.medianWealth]: 280.1,
  [RAW_FIELDS.belowSocialMinimum]: 7.3,
  [RAW_FIELDS.lowestIncomeShare]: 32.7,
  [RAW_FIELDS.highestIncomeShare]: 37.5,
  [RAW_FIELDS.gas]: 1090,
  [RAW_FIELDS.electricity]: 2260,
  // districtHeating intentionally omitted — CBS suppresses it here.
});

describe('deriveNeighborhoodStats', () => {
  it('returns null when there are no stats', () => {
    expect(deriveNeighborhoodStats(null)).toBeNull();
    expect(deriveNeighborhoodStats(undefined)).toBeNull();
  });

  it('maps the KPI strip, with WOZ formatted as euroK', () => {
    const view = deriveNeighborhoodStats(archipel)!;
    expect(view.kpis).toEqual([
      { labelKey: 'inhabitants', value: 6285, format: 'count' },
      { labelKey: 'households', value: 3545, format: 'count' },
      { labelKey: 'dwellings', value: 3728, format: 'count' },
      { labelKey: 'wozValue', value: 639, format: 'euroK' },
    ]);
  });

  it('computes age shares from counts, oldest first', () => {
    const view = deriveNeighborhoodStats(archipel)!;
    expect(view.age).toEqual([
      { labelKey: 'age65plus', percent: 24 }, // 1480/6285
      { labelKey: 'age45to65', percent: 30 },
      { labelKey: 'age25to45', percent: 24 },
      { labelKey: 'age15to25', percent: 11 },
      { labelKey: 'age0to15', percent: 12 },
    ]);
  });

  it('normalizes household composition to shares of their sum', () => {
    const { household } = deriveNeighborhoodStats(archipel)!;
    expect(household?.size).toBe(1.8);
    expect(household?.segments.map((s) => [s.labelKey, s.percent])).toEqual([
      ['singlePerson', 55],
      ['withChildren', 21],
      ['withoutChildren', 24],
    ]);
    // Weights sum to 100 so the donut ring closes exactly.
    const totalWeight = household!.segments.reduce((sum, s) => sum + s.weight, 0);
    expect(totalWeight).toBeCloseTo(100, 5);
  });

  it('keeps tenure percentages as-is (independent shares, not renormalized)', () => {
    const { tenure } = deriveNeighborhoodStats(archipel)!;
    expect(tenure).toEqual([
      { labelKey: 'ownerOccupied', weight: 54, percent: 54 },
      { labelKey: 'corporation', weight: 14, percent: 14 },
      { labelKey: 'otherRental', weight: 31, percent: 31 },
    ]);
  });

  it('computes origin shares from counts', () => {
    const { origin } = deriveNeighborhoodStats(archipel)!;
    expect(origin?.map((s) => [s.labelKey, s.percent])).toEqual([
      ['originNL', 52],
      ['originEurope', 23],
      ['originOutsideEurope', 25],
    ]);
  });

  it('exposes income tiles (with formats) and present-only shares', () => {
    const { income } = deriveNeighborhoodStats(archipel)!;
    expect(income?.tiles).toEqual([
      { labelKey: 'incomePerInhabitant', value: 59.6, format: 'euroKDec' },
      { labelKey: 'standardizedHouseholdIncome', value: 63.0, format: 'euroKDec' },
      { labelKey: 'medianWealth', value: 280.1, format: 'euroK' },
      { labelKey: 'belowSocialMinimum', value: 7.3, format: 'percent' },
    ]);
    expect(income?.shares).toEqual([
      { labelKey: 'lowestIncomeShare', value: 32.7 },
      { labelKey: 'highestIncomeShare', value: 37.5 },
    ]);
  });

  it('lists energy stats with their units', () => {
    const { energy } = deriveNeighborhoodStats(archipel)!;
    expect(energy).toEqual([
      { labelKey: 'gas', value: 1090, unit: 'm3' },
      { labelKey: 'electricity', value: 2260, unit: 'kWh' },
    ]);
  });

  it('reports a suppressed metric as null, not 0', () => {
    const { districtHeating } = deriveNeighborhoodStats(archipel)!;
    expect(districtHeating).toBeNull();
  });

  it('treats a real 0 as present (distinct from suppression)', () => {
    const view = deriveNeighborhoodStats(
      makeStats({ [RAW_FIELDS.before2000]: 100, [RAW_FIELDS.from2000]: 0 }),
    )!;
    expect(view.buildYear).toEqual([
      { labelKey: 'before2000', weight: 100, percent: 100 },
      { labelKey: 'from2000', weight: 0, percent: 0 },
    ]);
  });

  it('nulls out whole sections when their fields are absent', () => {
    const view = deriveNeighborhoodStats(makeStats({ [RAW_FIELDS.inhabitants]: 100 }))!;
    expect(view.kpis[0]).toEqual({ labelKey: 'inhabitants', value: 100, format: 'count' });
    expect(view.kpis[3]).toEqual({ labelKey: 'wozValue', value: null, format: 'euroK' });
    expect(view.age).toBeNull(); // inhabitants present but no age buckets
    expect(view.household).toBeNull();
    expect(view.tenure).toBeNull();
    expect(view.dwellingType).toBeNull();
    expect(view.origin).toBeNull();
    expect(view.buildYear).toBeNull();
    expect(view.income).toBeNull();
    expect(view.energy).toBeNull();
    expect(view.districtHeating).toBeNull();
  });
});
