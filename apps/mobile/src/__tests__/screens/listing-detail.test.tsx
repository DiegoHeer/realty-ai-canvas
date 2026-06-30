import { DataProvider, queryClient } from '@realty/data';
import { initI18n } from '@realty/i18n';
import { render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { I18nextProvider } from 'react-i18next';

import ListingDetailScreen from '@/app/listing/[id]';

afterEach(() => {
  queryClient.clear();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <DataProvider>
        <ListingDetailScreen />
      </DataProvider>
    </I18nextProvider>,
  );
}

// Listing content is served by the live staging API (mocks were removed), so we
// no longer assert on a specific listing's fields; we cover the data-independent
// error state here. The render path for a loaded listing is exercised by the
// visual-regression e2e suite against staging.
describe('ListingDetailScreen', () => {
  it('shows error state when no listing id is provided', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    const { getByText } = await renderScreen();
    // With no id, useListing(undefined) => enabled:false => no loading, no data
    // Screen falls through to the error state
    await waitFor(() => {
      expect(getByText(/Sorry, we couldn.t load this listing/)).toBeTruthy();
    });
  });
});
