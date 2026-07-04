import type { NeighborhoodStats } from '@realty/types';

/** The election shown in the area sheet. A future election = a new constant. */
export const ELECTION_KEY = 'tk2025';

/** Bars shown before the remainder collapses into "Overig". */
const TOP_PARTY_COUNT = 6;

/** Bar color for parties without a PARTY_COLORS entry (and for "Overig"). */
export const PARTY_FALLBACK_COLOR = '#94a3b8'; // slate-400

/**
 * Party brand colors keyed by the name exactly as the Kiesraad prints it (the
 * backend passes names through verbatim). Unknown names fall back to
 * {@link PARTY_FALLBACK_COLOR}, so a mismatched spelling degrades to a gray
 * bar instead of breaking. Exported for reuse by the future map choropleth.
 */
export const PARTY_COLORS: Record<string, string> = {
  'PVV (Partij voor de Vrijheid)': '#1e3c8c',
  'GROENLINKS / Partij van de Arbeid (PvdA)': '#d4230e',
  VVD: '#f57c00',
  'Nieuw Sociaal Contract (NSC)': '#0d3b53',
  D66: '#01af40',
  BBB: '#95bf3f',
  CDA: '#00805e',
  'SP (Socialistische Partij)': '#e3001a',
  DENK: '#00b7b2',
  'Partij voor de Dieren': '#006b2d',
  'Forum voor Democratie': '#841818',
  'Staatkundig Gereformeerde Partij (SGP)': '#e06d00',
  ChristenUnie: '#00a5e4',
  JA21: '#232c60',
  Volt: '#502379',
};

/** Short display labels for official names too long for a bar-row label. */
const PARTY_LABELS: Record<string, string> = {
  'PVV (Partij voor de Vrijheid)': 'PVV',
  'GROENLINKS / Partij van de Arbeid (PvdA)': 'GL-PvdA',
  'Nieuw Sociaal Contract (NSC)': 'NSC',
  'SP (Socialistische Partij)': 'SP',
  'Partij voor de Dieren': 'PvdD',
  'Forum voor Democratie': 'FvD',
  'Staatkundig Gereformeerde Partij (SGP)': 'SGP',
};

export interface ElectionRow {
  /** Raw party name from the API — stable identity for React keys. */
  key: string;
  /** Short display label ("GL-PvdA") or the raw name when not shortened. */
  label: string;
  color: string;
  /** Share of totalVotes, 0–100, one decimal. */
  share: number;
}

export interface ElectionView {
  rows: ElectionRow[];
  /** Combined share of parties beyond the top 6; null when nothing collapsed. */
  otherShare: number | null;
  totalVotes: number;
  stationCount: number;
  source: 'buurt' | 'wijk' | 'gemeente';
}

/**
 * Shape a neighborhood's TK2025 results for the area sheet: top parties by
 * votes with one-decimal shares, remainder collapsed into `otherShare`.
 * Returns null when there is no data (section hidden). Pure — no i18n or
 * formatting — so it is straightforward to unit test.
 */
export function deriveElectionStats(
  stats: NeighborhoodStats | null | undefined,
): ElectionView | null {
  const result = stats?.electionStats?.[ELECTION_KEY];
  if (!result || result.totalVotes <= 0) return null;

  const share = (votes: number) => Math.round((votes / result.totalVotes) * 1000) / 10;
  const sorted = Object.entries(result.parties)
    .filter(([, votes]) => votes > 0)
    .sort(([aName, aVotes], [bName, bVotes]) => bVotes - aVotes || aName.localeCompare(bName));

  const rows = sorted.slice(0, TOP_PARTY_COUNT).map(([name, votes]) => ({
    key: name,
    label: PARTY_LABELS[name] ?? name,
    color: PARTY_COLORS[name] ?? PARTY_FALLBACK_COLOR,
    share: share(votes),
  }));
  const restVotes = sorted
    .slice(TOP_PARTY_COUNT)
    .reduce((sum, [, votes]) => sum + votes, 0);

  return {
    rows,
    otherShare: restVotes > 0 ? share(restVotes) : null,
    totalVotes: result.totalVotes,
    stationCount: result.stationCount,
    source: result.source,
  };
}
