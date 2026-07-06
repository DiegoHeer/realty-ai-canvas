import type { NeighborhoodStats } from '@realty/types';

/**
 * Maps a party's full name (as returned by the API's `election_stats.parties`)
 * to a stable `slug` — used by the component to pick its logo — and an
 * abbreviated `label` for display. Only the 24 parties that have a logo are
 * listed; anything else (e.g. the tiny "ELLECT"/"NL PLAN" lists) falls back to
 * its raw name with no icon, but in practice never reaches the top five.
 */
const PARTY_META: Record<string, { slug: string; label: string }> = {
  'VVD': { slug: 'vvd', label: 'VVD' },
  'D66': { slug: 'd66', label: 'D66' },
  'PVV (Partij voor de Vrijheid)': { slug: 'pvv', label: 'PVV' },
  'GROENLINKS / Partij van de Arbeid (PvdA)': { slug: 'groenlinks-pvda', label: 'GL-PvdA' },
  'CDA': { slug: 'cda', label: 'CDA' },
  'Partij voor de Dieren': { slug: 'pvdd', label: 'PvdD' },
  'Forum voor Democratie': { slug: 'fvd', label: 'FvD' },
  'SP (Socialistische Partij)': { slug: 'sp', label: 'SP' },
  'Staatkundig Gereformeerde Partij (SGP)': { slug: 'sgp', label: 'SGP' },
  'ChristenUnie': { slug: 'christenunie', label: 'CU' },
  'Volt': { slug: 'volt', label: 'Volt' },
  'JA21': { slug: 'ja21', label: 'JA21' },
  'Belang Van Nederland (BVNL)': { slug: 'bvnl', label: 'BVNL' },
  'BIJ1': { slug: 'bij1', label: 'BIJ1' },
  'LP (Libertaire Partij)': { slug: 'lp', label: 'LP' },
  '50PLUS': { slug: '50plus', label: '50PLUS' },
  'Piratenpartij': { slug: 'piratenpartij', label: 'Piraten' },
  'FNP': { slug: 'fnp', label: 'FNP' },
  'Vrij Verbond': { slug: 'vrij-verbond', label: 'Vrij Verbond' },
  'DE LINIE': { slug: 'de-linie', label: 'De Linie' },
  'DENK': { slug: 'denk', label: 'DENK' },
  'BBB': { slug: 'bbb', label: 'BBB' },
  'Nieuw Sociaal Contract (NSC)': { slug: 'nsc', label: 'NSC' },
  'Vrede voor Dieren': { slug: 'vrede-voor-dieren', label: 'Vrede v. Dieren' },
};

/** How many parties the election section shows (the most-voted). */
const ELECTION_TOP_N = 5;

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

/**
 * CBS reorganized the "Kerncijfers wijken en buurten" payload between its 2023
 * and 2024 vintages, and the backend serves whichever vintage it has per
 * neighborhood — so a single city's `/v1/stats/neighborhoods` response mixes
 * both (e.g. Amsterdam is ~88% 2024). Two things changed:
 *
 *  1. Keys went from PascalCase-with-ordinal (`AantalInwoners_5`) to camelCase
 *     (`aantalInwoners`).
 *  2. Several breakdowns that were absolute counts in 2023 (age, household
 *     composition, origin) are published as percentages in 2024.
 *
 * {@link RAW_FIELDS} only knows the 2023 keys, so without translation every
 * 2024 neighborhood reads as all-`null` (blank choropleth + empty panel). The
 * fix is {@link normalizeStats}, which maps a 2024 record onto the 2023 keys so
 * the rest of the app speaks a single vocabulary.
 */

/** 2024 key → canonical (2023) key, for fields whose value means the same thing. */
const RENAME_2024: Record<string, string> = {
  aantalInwoners: RAW_FIELDS.inhabitants,
  aantalHuishoudens: RAW_FIELDS.households,
  woningvoorraad: RAW_FIELDS.dwellings,
  gemiddeldeWoningwaarde: RAW_FIELDS.wozValue,
  gemiddeldeHuishoudsgrootte: RAW_FIELDS.householdSize,
  percentageKoopwoningen: RAW_FIELDS.tenureOwner,
  percHuurwoningenInBezitWoningcorporaties: RAW_FIELDS.tenureCorporation,
  percHuurwoningenInBezitOverigeVerhuurders: RAW_FIELDS.tenureOther,
  percentageEengezinswoning: RAW_FIELDS.singleFamily,
  percentageMeergezinswoning: RAW_FIELDS.multiFamily,
  percentageBouwjaarklasseTot2000: RAW_FIELDS.before2000,
  percentageBouwjaarklasseVanaf2000: RAW_FIELDS.from2000,
  gemiddeldInkomenPerInwoner: RAW_FIELDS.incomePerInhabitant,
  gemiddeldGestandaardiseerdInkomenVanHuishoudens: RAW_FIELDS.standardizedHouseholdIncome,
  mediaanVermogenVanParticuliereHuish: RAW_FIELDS.medianWealth,
  percentageHuishoudensOnderOfRondSociaalMinimum: RAW_FIELDS.belowSocialMinimum,
  gemiddeldAardgasverbruik: RAW_FIELDS.gas,
  gemiddeldeElektriciteitslevering: RAW_FIELDS.electricity,
  percentageWoningenMetStadsverwarming: RAW_FIELDS.districtHeating,
  // No 2024 equivalent: the lowest-40%/highest-20% income-bracket shares
  // (`lowestIncomeShare`/`highestIncomeShare`) were redefined by CBS, so they
  // stay absent for 2024 records rather than being mislabeled.
};

/**
 * 2024 percentage key → canonical (2023) count key, reconstructed as
 * `pct% × total` (total = inhabitants). The view layer re-derives shares from
 * these counts, so the round-trip returns the original percentage — the
 * synthesized count is never shown directly.
 */
const PCT_OF_INHABITANTS_2024: Record<string, string> = {
  percentagePersonen0Tot15Jaar: RAW_FIELDS.age0to15,
  percentagePersonen15Tot25Jaar: RAW_FIELDS.age15to25,
  percentagePersonen25Tot45Jaar: RAW_FIELDS.age25to45,
  percentagePersonen45Tot65Jaar: RAW_FIELDS.age45to65,
  percentagePersonen65JaarEnOuder: RAW_FIELDS.age65plus,
  percentageMetHerkomstlandNederland: RAW_FIELDS.originNL,
  percentageMetHerkomstlandUitEuropaExclNl: RAW_FIELDS.originEurope,
  percentageMetHerkomstlandBuitenEuropa: RAW_FIELDS.originOutsideEurope,
};

/** As {@link PCT_OF_INHABITANTS_2024}, but the total is the household count. */
const PCT_OF_HOUSEHOLDS_2024: Record<string, string> = {
  percentageEenpersoonshuishoudens: RAW_FIELDS.singlePerson,
  percentageHuishoudensZonderKinderen: RAW_FIELDS.withoutChildren,
  percentageHuishoudensMetKinderen: RAW_FIELDS.withChildren,
};

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Translate one neighborhood's raw stats to the canonical 2023 key set. 2023
 * records (and anything already canonical) pass through unchanged; 2024 records
 * are remapped, with their percentage breakdowns reconstructed as counts.
 * Idempotent, so it is safe to apply more than once. A field with no 2024
 * counterpart is simply absent, which the derivation already renders as "—".
 */
export function normalizeStats(entry: NeighborhoodStats): NeighborhoodStats {
  const raw = entry.stats ?? {};
  // The 2024 vintage is the one keyed `aantalInwoners`; 2023 uses `AantalInwoners_5`.
  if (!('aantalInwoners' in raw)) return entry;

  const out: Record<string, number> = {};
  for (const [src, dest] of Object.entries(RENAME_2024)) {
    if (isFiniteNum(raw[src])) out[dest] = raw[src];
  }
  const synthesize = (map: Record<string, string>, total: unknown) => {
    if (!isFiniteNum(total)) return;
    for (const [src, dest] of Object.entries(map)) {
      if (isFiniteNum(raw[src])) out[dest] = (raw[src] / 100) * total;
    }
  };
  synthesize(PCT_OF_INHABITANTS_2024, raw.aantalInwoners);
  synthesize(PCT_OF_HOUSEHOLDS_2024, raw.aantalHuishoudens);

  return { ...entry, stats: out };
}

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

/** One party's share of the vote in the election section. */
export interface ElectionPartyRow {
  /** Logo slug for the component's asset map, or `null` when no logo exists. */
  slug: string | null;
  /** Abbreviated party name, e.g. "GL-PvdA". */
  label: string;
  /** Vote share on a 0–100 scale, unrounded (formatted/normalized by the view). */
  share: number;
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
  /** Top parties by vote share, or `null` when there is no election data. */
  election: { period: string; parties: ElectionPartyRow[] } | null;
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

/**
 * Rank the {@link ELECTION_TOP_N} most-voted parties and express each as a share
 * of the total vote. Returns `null` when there is no usable election data.
 */
function deriveElection(
  election: NeighborhoodStats['election'],
): NeighborhoodStatsView['election'] {
  if (!election || election.totalVotes <= 0) return null;
  const parties = Object.entries(election.parties)
    .filter(([, votes]) => isFiniteNum(votes) && votes > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, ELECTION_TOP_N)
    .map(([name, votes]) => {
      const meta = PARTY_META[name];
      return {
        slug: meta?.slug ?? null,
        label: meta?.label ?? name,
        share: (votes / election.totalVotes) * 100,
      };
    });
  return parties.length > 0 ? { period: election.period, parties } : null;
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
    election: deriveElection(stats.election),
  };
}
