import type { NeighborhoodStats } from '@realty/types';

import { deriveNeighborhoodStats, normalizeStats, RAW_FIELDS } from '@/lib/neighborhood-stats';

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

// A 2024-vintage record (the CBS layout served for most neighborhoods outside
// Den Haag): camelCase keys, with age/household/origin as percentages rather
// than counts. Totals are round so the synthesized counts re-derive exactly.
const borgerbuurt2024: NeighborhoodStats = {
  code: 'BU0363ES02',
  statsYear: 2024,
  stats: {
    aantalInwoners: 1000,
    aantalHuishoudens: 500,
    woningvoorraad: 480,
    gemiddeldeWoningwaarde: 350,
    gemiddeldeHuishoudsgrootte: 2.0,
    // age (% of inhabitants), 0-15 .. 65+
    percentagePersonen0Tot15Jaar: 10,
    percentagePersonen15Tot25Jaar: 10,
    percentagePersonen25Tot45Jaar: 30,
    percentagePersonen45Tot65Jaar: 25,
    percentagePersonen65JaarEnOuder: 25,
    // household composition (% of households)
    percentageEenpersoonshuishoudens: 60,
    percentageHuishoudensMetKinderen: 25,
    percentageHuishoudensZonderKinderen: 15,
    // tenure (% of stock) — already percentages in both vintages
    percentageKoopwoningen: 40,
    percHuurwoningenInBezitWoningcorporaties: 45,
    percHuurwoningenInBezitOverigeVerhuurders: 15,
    // dwelling type + build year (%)
    percentageEengezinswoning: 30,
    percentageMeergezinswoning: 70,
    percentageBouwjaarklasseTot2000: 80,
    percentageBouwjaarklasseVanaf2000: 20,
    // origin (% of inhabitants)
    percentageMetHerkomstlandNederland: 50,
    percentageMetHerkomstlandUitEuropaExclNl: 20,
    percentageMetHerkomstlandBuitenEuropa: 30,
    // income + energy + district heating
    gemiddeldInkomenPerInwoner: 30.5,
    gemiddeldGestandaardiseerdInkomenVanHuishoudens: 40.0,
    mediaanVermogenVanParticuliereHuish: 120.0,
    percentageHuishoudensOnderOfRondSociaalMinimum: 8.0,
    gemiddeldAardgasverbruik: 900,
    gemiddeldeElektriciteitslevering: 2500,
    percentageWoningenMetStadsverwarming: 5,
    // CBS string/identifier fields that ride along — must be ignored, not coerced.
    buurtnaam: 'Borgerbuurt' as unknown as number,
    water: 'NEE' as unknown as number,
  },
};

describe('normalizeStats', () => {
  it('leaves a 2023 record untouched', () => {
    expect(normalizeStats(archipel)).toBe(archipel);
  });

  it('maps 2024 keys onto the canonical 2023 keys, preserving the year', () => {
    const { stats, statsYear } = normalizeStats(borgerbuurt2024);
    expect(statsYear).toBe(2024); // the "CBS 2024" label still reads correctly
    expect(stats[RAW_FIELDS.inhabitants]).toBe(1000);
    expect(stats[RAW_FIELDS.wozValue]).toBe(350);
    expect(stats[RAW_FIELDS.tenureOwner]).toBe(40);
    expect(stats[RAW_FIELDS.gas]).toBe(900);
    expect(stats[RAW_FIELDS.districtHeating]).toBe(5);
  });

  it('reconstructs 2024 percentage breakdowns as counts of their total', () => {
    const { stats } = normalizeStats(borgerbuurt2024);
    expect(stats[RAW_FIELDS.age0to15]).toBe(100); // 10% of 1000 inhabitants
    expect(stats[RAW_FIELDS.age65plus]).toBe(250); // 25% of 1000
    expect(stats[RAW_FIELDS.singlePerson]).toBe(300); // 60% of 500 households
    expect(stats[RAW_FIELDS.originNL]).toBe(500); // 50% of 1000
  });

  it('drops non-numeric CBS fields rather than coercing them', () => {
    const { stats } = normalizeStats(borgerbuurt2024);
    expect(stats.buurtnaam).toBeUndefined();
    expect(stats.water).toBeUndefined();
  });

  it('is idempotent', () => {
    const once = normalizeStats(borgerbuurt2024);
    expect(normalizeStats(once)).toEqual(once);
  });
});

describe('deriveNeighborhoodStats on a normalized 2024 record', () => {
  const view = deriveNeighborhoodStats(normalizeStats(borgerbuurt2024))!;

  it('fills the KPI strip from camelCase keys', () => {
    expect(view.kpis).toEqual([
      { labelKey: 'inhabitants', value: 1000, format: 'count' },
      { labelKey: 'households', value: 500, format: 'count' },
      { labelKey: 'dwellings', value: 480, format: 'count' },
      { labelKey: 'wozValue', value: 350, format: 'euroK' },
    ]);
  });

  it('re-derives the original age percentages, oldest first', () => {
    expect(view.age).toEqual([
      { labelKey: 'age65plus', percent: 25 },
      { labelKey: 'age45to65', percent: 25 },
      { labelKey: 'age25to45', percent: 30 },
      { labelKey: 'age15to25', percent: 10 },
      { labelKey: 'age0to15', percent: 10 },
    ]);
  });

  it('re-derives household + origin shares from the reconstructed counts', () => {
    expect(view.household?.segments.map((s) => [s.labelKey, s.percent])).toEqual([
      ['singlePerson', 60],
      ['withChildren', 25],
      ['withoutChildren', 15],
    ]);
    expect(view.origin?.map((s) => [s.labelKey, s.percent])).toEqual([
      ['originNL', 50],
      ['originEurope', 20],
      ['originOutsideEurope', 30],
    ]);
  });

  it('keeps tenure/build-year percentages and lists energy + district heating', () => {
    expect(view.tenure).toEqual([
      { labelKey: 'ownerOccupied', weight: 40, percent: 40 },
      { labelKey: 'corporation', weight: 45, percent: 45 },
      { labelKey: 'otherRental', weight: 15, percent: 15 },
    ]);
    expect(view.energy).toEqual([
      { labelKey: 'gas', value: 900, unit: 'm3' },
      { labelKey: 'electricity', value: 2500, unit: 'kWh' },
    ]);
    expect(view.districtHeating).toBe(5);
  });
});
