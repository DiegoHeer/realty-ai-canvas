import type { NeighborhoodStats } from '@realty/types';

/**
 * Maps the curated subset of CBS "Kerncijfers wijken en buurten" fields we
 * visualize to their raw keys in the Den Haag (`0518`) stats payload. The
 * `_NN` suffix is CBS's column ordinal. Unless noted, values are absolute
 * counts; some are already percentages (of the housing stock) or averages.
 *
 * Exported so the unit test can build fixtures against the real key names.
 */
export const RAW_FIELDS = {
  // KPI strip
  inhabitants: 'AantalInwoners_5',
  households: 'HuishoudensTotaal_29',
  dwellings: 'Woningvoorraad_35',
  wozValue: 'GemiddeldeWOZWaardeVanWoningen_36', // ×1000 EUR

  // Age (counts of inhabitants)
  age0to15: 'k_0Tot15Jaar_8',
  age15to25: 'k_15Tot25Jaar_9',
  age25to45: 'k_25Tot45Jaar_10',
  age45to65: 'k_45Tot65Jaar_11',
  age65plus: 'k_65JaarOfOuder_12',

  // Household composition (counts of households) + average size
  singlePerson: 'Eenpersoonshuishoudens_30',
  withoutChildren: 'HuishoudensZonderKinderen_31',
  withChildren: 'HuishoudensMetKinderen_32',
  householdSize: 'GemiddeldeHuishoudensgrootte_33',

  // Tenure (% of housing stock)
  tenureOwner: 'Koopwoningen_41',
  tenureCorporation: 'InBezitWoningcorporatie_43',
  tenureOther: 'InBezitOverigeVerhuurders_44',

  // Dwelling type (% of housing stock)
  singleFamily: 'PercentageEengezinswoning_37',
  multiFamily: 'PercentageMeergezinswoning_38',

  // Origin (counts of inhabitants)
  originNL: 'Nederland_17',
  originEurope: 'EuropaExclusiefNederland_18',
  originOutsideEurope: 'BuitenEuropa_19',

  // Construction year (% of housing stock)
  before2000: 'BouwjaarVoor2000_46',
  from2000: 'BouwjaarVanaf2000_47',

  // Income & wealth
  incomePerInhabitant: 'GemiddeldInkomenPerInwoner_81', // ×1000 EUR
  standardizedHouseholdIncome: 'GemGestandaardiseerdInkomenVanHuish_84', // ×1000 EUR
  medianWealth: 'MediaanVermogenVanParticuliereHuish_91', // ×1000 EUR
  belowSocialMinimum: 'HuishOnderOfRondSociaalMinimum_88', // %
  lowestIncomeShare: 'k_40PersonenMetLaagsteInkomen_82', // % of income held by lowest 40%
  highestIncomeShare: 'k_20PersonenMetHoogsteInkomen_83', // % of income held by highest 20%

  // Energy (per dwelling, per year)
  gas: 'GemiddeldAardgasverbruikTotaal_56', // m³
  electricity: 'GemiddeldeElektriciteitsleveringTotaal_48', // kWh

  // Frequently suppressed by CBS — the canonical "missing" example.
  districtHeating: 'PercentageWoningenMetStadsverwarming_64', // %
} as const;

/** Number formatting hint, resolved to a locale-aware string in the component. */
export type StatFormat = 'count' | 'euroK' | 'euroKDec' | 'percent';

/** One slice of a part-to-whole chart (segmented bar / donut). */
export interface StatSegment {
  /** i18n key under `area.stats`. */
  labelKey: string;
  /** Unrounded share on a 0–100 scale — drives bar widths and donut arcs. */
  weight: number;
  /** Rounded percentage for the label. */
  percent: number;
}

export interface KpiStat {
  labelKey: string;
  value: number | null;
  format: StatFormat;
}

export interface AgeRow {
  labelKey: string;
  /** Share of inhabitants, rounded to a whole percentage. */
  percent: number;
}

export interface IncomeTile {
  labelKey: string;
  value: number | null;
  format: StatFormat;
}

export interface IncomeShare {
  labelKey: string;
  /** % of total income held by this group (0–100). */
  value: number;
}

export interface EnergyStat {
  labelKey: string;
  value: number;
  unit: 'm3' | 'kWh';
}

/**
 * A presentation-ready view of one neighborhood's stats. Every section is
 * `null` when the underlying figures are entirely absent, so the component can
 * simply skip it. Individual values inside a section may still be `null`
 * (rendered as "—"); a `null` is always genuine suppression, never a real `0`.
 */
export interface NeighborhoodStatsView {
  kpis: KpiStat[];
  age: AgeRow[] | null;
  household: { size: number | null; segments: StatSegment[] } | null;
  tenure: StatSegment[] | null;
  dwellingType: StatSegment[] | null;
  origin: StatSegment[] | null;
  buildYear: StatSegment[] | null;
  income: { tiles: IncomeTile[]; shares: IncomeShare[] } | null;
  energy: EnergyStat[] | null;
  /** % of dwellings on district heating, or `null` when CBS suppressed it. */
  districtHeating: number | null;
}

/** Read a field as a finite number, treating `null`/missing/`NaN` as absent. */
function num(stats: Record<string, number>, key: string): number | null {
  const v = stats[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const round = (n: number): number => Math.round(n);

/** Build segments from absolute counts, normalized to shares of their sum. */
function segmentsFromCounts(
  stats: Record<string, number>,
  entries: { labelKey: string; key: string }[],
): StatSegment[] | null {
  const present = entries
    .map(({ labelKey, key }) => ({ labelKey, count: num(stats, key) }))
    .filter((e): e is { labelKey: string; count: number } => e.count != null);
  const total = present.reduce((sum, e) => sum + e.count, 0);
  if (present.length === 0 || total <= 0) return null;
  return present.map(({ labelKey, count }) => ({
    labelKey,
    weight: (count / total) * 100,
    percent: round((count / total) * 100),
  }));
}

/**
 * Build segments from fields that are already percentages of the housing
 * stock. They are independent shares (the remainder is "unknown/other"), so
 * they are NOT renormalized — widths reflect the raw percentages.
 */
function segmentsFromPercents(
  stats: Record<string, number>,
  entries: { labelKey: string; key: string }[],
): StatSegment[] | null {
  const present = entries
    .map(({ labelKey, key }) => ({ labelKey, pct: num(stats, key) }))
    .filter((e): e is { labelKey: string; pct: number } => e.pct != null);
  if (present.length === 0) return null;
  return present.map(({ labelKey, pct }) => ({ labelKey, weight: pct, percent: round(pct) }));
}

function deriveAge(stats: Record<string, number>): AgeRow[] | null {
  const inhabitants = num(stats, RAW_FIELDS.inhabitants);
  if (inhabitants == null || inhabitants <= 0) return null;
  // Oldest first, matching the dark→light sequential ramp in the design.
  const buckets: { labelKey: string; key: string }[] = [
    { labelKey: 'age65plus', key: RAW_FIELDS.age65plus },
    { labelKey: 'age45to65', key: RAW_FIELDS.age45to65 },
    { labelKey: 'age25to45', key: RAW_FIELDS.age25to45 },
    { labelKey: 'age15to25', key: RAW_FIELDS.age15to25 },
    { labelKey: 'age0to15', key: RAW_FIELDS.age0to15 },
  ];
  const rows = buckets.flatMap(({ labelKey, key }) => {
    const count = num(stats, key);
    return count == null ? [] : [{ labelKey, percent: round((count / inhabitants) * 100) }];
  });
  return rows.length > 0 ? rows : null;
}

function deriveIncome(stats: Record<string, number>): NeighborhoodStatsView['income'] {
  const tiles: IncomeTile[] = [
    { labelKey: 'incomePerInhabitant', value: num(stats, RAW_FIELDS.incomePerInhabitant), format: 'euroKDec' },
    { labelKey: 'standardizedHouseholdIncome', value: num(stats, RAW_FIELDS.standardizedHouseholdIncome), format: 'euroKDec' },
    { labelKey: 'medianWealth', value: num(stats, RAW_FIELDS.medianWealth), format: 'euroK' },
    { labelKey: 'belowSocialMinimum', value: num(stats, RAW_FIELDS.belowSocialMinimum), format: 'percent' },
  ];
  const shares: IncomeShare[] = (
    [
      { labelKey: 'lowestIncomeShare', key: RAW_FIELDS.lowestIncomeShare },
      { labelKey: 'highestIncomeShare', key: RAW_FIELDS.highestIncomeShare },
    ] as const
  ).flatMap(({ labelKey, key }) => {
    const value = num(stats, key);
    return value == null ? [] : [{ labelKey, value }];
  });
  const hasAny = tiles.some((t) => t.value != null) || shares.length > 0;
  return hasAny ? { tiles, shares } : null;
}

function deriveEnergy(stats: Record<string, number>): EnergyStat[] | null {
  const rows = (
    [
      { labelKey: 'gas', key: RAW_FIELDS.gas, unit: 'm3' as const },
      { labelKey: 'electricity', key: RAW_FIELDS.electricity, unit: 'kWh' as const },
    ] as const
  ).flatMap(({ labelKey, key, unit }) => {
    const value = num(stats, key);
    return value == null ? [] : [{ labelKey, value, unit }];
  });
  return rows.length > 0 ? rows : null;
}

/**
 * Shape a raw {@link NeighborhoodStats} record into a {@link NeighborhoodStatsView}
 * for the area sheet. Returns `null` only when there are no stats at all; an
 * empty-but-present record yields a view whose sections are individually `null`.
 * Pure (no i18n/formatting/colors) so it is straightforward to unit test.
 */
export function deriveNeighborhoodStats(
  stats: NeighborhoodStats | null | undefined,
): NeighborhoodStatsView | null {
  if (!stats) return null;
  const s = stats.stats ?? {};

  const household = (() => {
    const segments = segmentsFromCounts(s, [
      { labelKey: 'singlePerson', key: RAW_FIELDS.singlePerson },
      { labelKey: 'withChildren', key: RAW_FIELDS.withChildren },
      { labelKey: 'withoutChildren', key: RAW_FIELDS.withoutChildren },
    ]);
    if (!segments) return null;
    return { size: num(s, RAW_FIELDS.householdSize), segments };
  })();

  return {
    kpis: [
      { labelKey: 'inhabitants', value: num(s, RAW_FIELDS.inhabitants), format: 'count' },
      { labelKey: 'households', value: num(s, RAW_FIELDS.households), format: 'count' },
      { labelKey: 'dwellings', value: num(s, RAW_FIELDS.dwellings), format: 'count' },
      { labelKey: 'wozValue', value: num(s, RAW_FIELDS.wozValue), format: 'euroK' },
    ],
    age: deriveAge(s),
    household,
    tenure: segmentsFromPercents(s, [
      { labelKey: 'ownerOccupied', key: RAW_FIELDS.tenureOwner },
      { labelKey: 'corporation', key: RAW_FIELDS.tenureCorporation },
      { labelKey: 'otherRental', key: RAW_FIELDS.tenureOther },
    ]),
    dwellingType: segmentsFromPercents(s, [
      { labelKey: 'singleFamily', key: RAW_FIELDS.singleFamily },
      { labelKey: 'multiFamily', key: RAW_FIELDS.multiFamily },
    ]),
    origin: segmentsFromCounts(s, [
      { labelKey: 'originNL', key: RAW_FIELDS.originNL },
      { labelKey: 'originEurope', key: RAW_FIELDS.originEurope },
      { labelKey: 'originOutsideEurope', key: RAW_FIELDS.originOutsideEurope },
    ]),
    buildYear: segmentsFromPercents(s, [
      { labelKey: 'before2000', key: RAW_FIELDS.before2000 },
      { labelKey: 'from2000', key: RAW_FIELDS.from2000 },
    ]),
    income: deriveIncome(s),
    energy: deriveEnergy(s),
    districtHeating: num(s, RAW_FIELDS.districtHeating),
  };
}
