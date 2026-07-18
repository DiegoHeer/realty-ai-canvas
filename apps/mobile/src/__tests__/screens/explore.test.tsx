import { DataProvider, queryClient } from '@realty/data';
import { initI18n } from '@realty/i18n';
import { fireEvent, render, within } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import ListingsScreen from '@/app/(tabs)/explore';
import { resetFilters } from '@/lib/filters';

afterEach(() => {
  queryClient.clear();
  // The sort dropdown writes through to the module-level filters store; reset it
  // so one test's selection doesn't leak into the next.
  resetFilters();
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
// localized sort control (which replaced the old "Listings" title).
describe('ListingsScreen', () => {
  it('shows loading text initially', async () => {
    const { getByText } = await renderScreen();
    // The loading text comes from the i18n key common.loading ("Loading…")
    expect(getByText('Loading…')).toBeTruthy();
  });

  it('shows the default sort label in English', async () => {
    const { getByTestId } = await renderScreen('en');
    // Default sort is `newest` → filtersPage.sortOptions.newest.
    expect(within(getByTestId('sort-button')).getByText('Newest')).toBeTruthy();
  });

  it('shows the default sort label in Dutch', async () => {
    const { getByTestId } = await renderScreen('nl');
    expect(within(getByTestId('sort-button')).getByText('Nieuwste')).toBeTruthy();
  });

  it('opens the sort menu and changes the selected sort', async () => {
    const { getByTestId, queryByTestId } = await renderScreen('en');
    // Menu is closed until the button is pressed.
    expect(queryByTestId('sort-option-oldest')).toBeNull();

    // Await the press so the re-render flushes before the assertion (RNTL v14).
    await fireEvent.press(getByTestId('sort-button'));
    expect(getByTestId('sort-option-oldest')).toBeTruthy();

    await fireEvent.press(getByTestId('sort-option-oldest'));
    // Selecting closes the menu and the button reflects the new sort.
    expect(queryByTestId('sort-option-oldest')).toBeNull();
    expect(within(getByTestId('sort-button')).getByText('Oldest')).toBeTruthy();
  });

  it('renders the location search bar with its filters button', async () => {
    const { getByPlaceholderText, getByLabelText } = await renderScreen();
    expect(getByPlaceholderText('Search')).toBeTruthy();
    expect(getByLabelText('Filters')).toBeTruthy();
  });
});
