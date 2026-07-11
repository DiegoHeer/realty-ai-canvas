import { DataProvider, queryClient } from '@realty/data';
import { initI18n } from '@realty/i18n';
import { render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import ListingsScreen from '@/app/(tabs)/explore';

afterEach(() => {
  queryClient.clear();
});

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <DataProvider>
        <ListingsScreen />
      </DataProvider>
    </I18nextProvider>,
  );
}

// Listing content is served by the live staging API (mocks were removed), so
// these tests only assert on data-independent UI: the loading state and the
// localized title.
describe('ListingsScreen', () => {
  it('shows loading text initially', async () => {
    const { getByText } = await renderScreen();
    // The loading text comes from the i18n key common.loading ("Loading…")
    expect(getByText('Loading…')).toBeTruthy();
  });

  it('renders title in English', async () => {
    const { getByText } = await renderScreen('en');
    expect(getByText('Listings')).toBeTruthy();
  });

  it('renders title in Dutch', async () => {
    const { getByText } = await renderScreen('nl');
    expect(getByText('Aanbod')).toBeTruthy();
  });

  it('renders the location search bar with its filters button', async () => {
    const { getByPlaceholderText, getByLabelText } = await renderScreen();
    expect(getByPlaceholderText('Search')).toBeTruthy();
    expect(getByLabelText('Filters')).toBeTruthy();
  });
});
