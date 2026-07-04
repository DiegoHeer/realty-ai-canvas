import type { NeighborhoodStats } from '@realty/types';

import {
  deriveElectionStats,
  ELECTION_KEY,
  PARTY_COLORS,
  PARTY_FALLBACK_COLOR,
} from '@/lib/election-stats';

function withElection(
  parties: Record<string, number>,
  overrides: Partial<{ totalVotes: number; stationCount: number; source: 'buurt' | 'wijk' }> = {},
): NeighborhoodStats {
  const totalVotes =
    overrides.totalVotes ?? Object.values(parties).reduce((sum, v) => sum + v, 0);
  return {
    code: 'BU05180546',
    statsYear: 2023,
    stats: {},
    electionStats: {
      [ELECTION_KEY]: {
        totalVotes,
        stationCount: overrides.stationCount ?? 2,
        source: overrides.source ?? 'buurt',
        parties,
      },
    },
  };
}

describe('deriveElectionStats', () => {
  it('returns null without stats, without electionStats, and with zero votes', () => {
    expect(deriveElectionStats(null)).toBeNull();
    expect(deriveElectionStats(undefined)).toBeNull();
    expect(
      deriveElectionStats({ code: 'x', statsYear: 2023, stats: {} }),
    ).toBeNull();
    expect(deriveElectionStats(withElection({}, { totalVotes: 0 }))).toBeNull();
  });

  it('sorts by votes, keeps the top 6, and collapses the rest into otherShare', () => {
    const view = deriveElectionStats(
      withElection({ A: 400, B: 300, C: 200, D: 100, E: 50, F: 40, G: 30, H: 20 }),
    )!;
    expect(view.rows.map((r) => r.key)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    // G + H = 50 of 1140 total
    expect(view.otherShare).toBeCloseTo(4.4, 1);
    expect(view.totalVotes).toBe(1140);
  });

  it('computes one-decimal shares of totalVotes', () => {
    const view = deriveElectionStats(withElection({ A: 500, B: 400, C: 100 }))!;
    expect(view.rows[0]).toMatchObject({ key: 'A', share: 50 });
    expect(view.rows[1]).toMatchObject({ key: 'B', share: 40 });
    expect(view.otherShare).toBeNull(); // only 3 parties, nothing collapsed
  });

  it('uses official colors and short labels for known parties, gray fallback otherwise', () => {
    const known = Object.keys(PARTY_COLORS)[0]!;
    const view = deriveElectionStats(withElection({ [known]: 60, 'Lijst Nieuw': 40 }))!;
    expect(view.rows[0]!.color).toBe(PARTY_COLORS[known]);
    expect(view.rows[1]!.color).toBe(PARTY_FALLBACK_COLOR);
    expect(view.rows[1]!.label).toBe('Lijst Nieuw');
  });

  it('shortens long official names', () => {
    const view = deriveElectionStats(
      withElection({ 'GROENLINKS / Partij van de Arbeid (PvdA)': 100 }),
    )!;
    expect(view.rows[0]!.label).toBe('GL-PvdA');
  });

  it('drops zero-vote parties and breaks vote ties by name', () => {
    const view = deriveElectionStats(withElection({ Zeta: 50, Alfa: 50, Nul: 0 }))!;
    expect(view.rows.map((r) => r.key)).toEqual(['Alfa', 'Zeta']);
  });

  it('passes source and stationCount through', () => {
    const view = deriveElectionStats(withElection({ A: 10 }, { source: 'wijk', stationCount: 3 }))!;
    expect(view.source).toBe('wijk');
    expect(view.stationCount).toBe(3);
  });
});
