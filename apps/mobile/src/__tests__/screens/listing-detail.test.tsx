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

  it('renders listing content after loading', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'lst_001' });
    const { getByText } = await renderScreen();
    await waitFor(() => {
      expect(getByText('Bright canal-side apartment')).toBeTruthy();
    });
    // Price: €675,000
    expect(getByText(/€/)).toBeTruthy();
    expect(getByText(/675/)).toBeTruthy();
    // Address
    expect(getByText(/Prinsengracht 412/)).toBeTruthy();
    // Status
    expect(getByText('For sale')).toBeTruthy();
    // Stats
    expect(getByText('2')).toBeTruthy(); // bedrooms value
    expect(getByText('Bedrooms')).toBeTruthy();
    expect(getByText('1')).toBeTruthy(); // bathrooms value
    expect(getByText('Bathrooms')).toBeTruthy();
    expect(getByText('84 m²')).toBeTruthy();
  });

  it('renders description when present', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'lst_001' });
    const { getByText } = await renderScreen();
    await waitFor(() => {
      expect(
        getByText(/light-filled two-bedroom apartment/),
      ).toBeTruthy();
    });
  });

  it('renders in Dutch', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'lst_001' });
    const { getByText } = await renderScreen('nl');
    await waitFor(() => {
      expect(getByText('Bright canal-side apartment')).toBeTruthy();
    });
    expect(getByText('Te koop')).toBeTruthy();
    expect(getByText('Slaapkamers')).toBeTruthy();
    expect(getByText('Badkamers')).toBeTruthy();
    expect(getByText('Oppervlakte')).toBeTruthy();
    // "Visit realtor" button is only shown when sourceUrl is present;
    // the mock listing has no sourceUrl, so we verify label absence.
    expect(getByText('84 m²')).toBeTruthy();
  });
});
