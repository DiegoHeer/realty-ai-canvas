import { initI18n } from '@realty/i18n';
import type { NeighborhoodStats } from '@realty/types';
import { render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { AreaStats } from '@/components/area-stats';
import { RAW_FIELDS } from '@/lib/neighborhood-stats';

async function renderStats(stats: NeighborhoodStats | null, language: 'en' | 'nl' = 'nl') {
  const i18n = initI18n(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <AreaStats stats={stats} />
    </I18nextProvider>,
  );
}

// A subset of Archipelbuurt's real values, with district heating left out so the
// suppressed-data state renders (CBS genuinely omits it there).
const archipel: NeighborhoodStats = {
  code: 'BU05180546',
  statsYear: 2023,
  stats: {
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
  },
};

describe('AreaStats', () => {
  it('shows the no-stats message when there are no stats', async () => {
    const { getByText } = await renderStats(null);
    expect(getByText('Geen statistieken beschikbaar voor deze buurt.')).toBeTruthy();
  });

  it('renders the source pill, KPI values and section titles', async () => {
    const { getByText } = await renderStats(archipel);
    expect(getByText('CBS 2023')).toBeTruthy();
    expect(getByText(/6[.,]285/)).toBeTruthy(); // inhabitants (locale grouping)
    expect(getByText('€639k')).toBeTruthy(); // avg. WOZ value
    expect(getByText('Leeftijdsopbouw')).toBeTruthy();
    expect(getByText('Huishoudsamenstelling')).toBeTruthy();
  });

  it('draws the household donut (track ring + one arc per segment)', async () => {
    const { getAllByTestId } = await renderStats(archipel);
    // 1 background ring + 3 composition arcs.
    expect(getAllByTestId('circle').length).toBeGreaterThanOrEqual(4);
  });

  it('renders the suppressed-data state for a null metric (district heating)', async () => {
    const { getByText } = await renderStats(archipel);
    expect(getByText('Niet bekendgemaakt voor deze buurt')).toBeTruthy();
  });
});
