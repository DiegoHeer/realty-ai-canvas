import { DataProvider, queryClient } from '@realty/data';
import { initI18n } from '@realty/i18n';
import type { Listing } from '@realty/types';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import MapScreen from '@/app/(tabs)/index';
import { clearLikes, toggleLike } from '@/lib/likes';
import { clearRecentViews, recordRecentView } from '@/lib/recent-views';

afterEach(() => {
  queryClient.clear();
  // The likes / recent-views stores are module singletons — reset them so each
  // test starts clean.
  clearLikes();
  clearRecentViews();
});

// Prices are distinct so each marker's price bubble identifies its listing.
function makeListing(id: string, price: number): Listing {
  return {
    id,
    title: `Home ${id}`,
    price,
    currency: 'EUR',
    status: 'for_sale',
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 84,
    address: { line1: 'Teststraat 1', city: 'Amsterdam', postalCode: '1011 AB', country: 'NL' },
    location: { latitude: 52.37, longitude: 4.89 },
    images: [{ id: `${id}_img`, url: 'https://example.test/cover.jpg' }],
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

async function renderScreen() {
  const i18n = initI18n('en');
  return render(
    <I18nextProvider i18n={i18n}>
      <DataProvider>
        <MapScreen />
      </DataProvider>
    </I18nextProvider>,
  );
}

describe('MapScreen', () => {
  it('renders the map component', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => {
      expect(getByTestId('maplibre-map')).toBeTruthy();
    });
  });

  it('renders without crashing when data is loading', async () => {
    const { toJSON } = await renderScreen();
    expect(toJSON()).toBeTruthy();
  });

  it('toggles a map overlay and its legend from the layer pills', async () => {
    const { getByText, queryByText } = await renderScreen();

    // No overlay yet — no legend.
    expect(queryByText('dB')).toBeNull();

    // Toggling Noise on shows its legend (dB classes at any zoom).
    fireEvent.press(getByText('Noise'));
    await waitFor(() => {
      expect(getByText('dB')).toBeTruthy();
      expect(getByText('≤45')).toBeTruthy();
    });

    // Overlays are mutually exclusive: switching to Air quality replaces the
    // noise legend with the NO2 one.
    fireEvent.press(getByText('Air quality'));
    await waitFor(() => {
      expect(queryByText('dB')).toBeNull();
      expect(getByText('µg/m³')).toBeTruthy();
    });

    // Tapping the active pill toggles it back off.
    fireEvent.press(getByText('Air quality'));
    await waitFor(() => {
      expect(queryByText('µg/m³')).toBeNull();
    });
  });

  it('hints to zoom in for building-level overlays at the initial zoom', async () => {
    const { getByText } = await renderScreen();
    // Energy labels only render around z≥15.5; the map starts at z11.
    fireEvent.press(getByText('Energy labels'));
    await waitFor(() => {
      expect(getByText('Zoom in to see this layer')).toBeTruthy();
    });
  });
});

// The Favorites/Recent pills swap the map's markers to the locally stored
// snapshots. The server query yields no listings in tests, so every price
// bubble on screen comes from the likes / recent-views stores.
describe('MapScreen snapshot pills', () => {
  it('shows liked homes while the Favorites pill is active, and reverts on toggle-off', async () => {
    toggleLike(makeListing('lst_fav', 500_000));
    const { getByText, queryByText } = await renderScreen();

    // Not filtered yet — the liked home's marker isn't on the map.
    expect(queryByText('€500k')).toBeNull();

    fireEvent.press(getByText('Favorites'));
    await waitFor(() => {
      expect(getByText('€500k')).toBeTruthy();
    });

    fireEvent.press(getByText('Favorites'));
    await waitFor(() => {
      expect(queryByText('€500k')).toBeNull();
    });
  });

  it('shows recently viewed homes while the Recent pill is active', async () => {
    recordRecentView(makeListing('lst_seen', 750_000));
    const { getByText, queryByText } = await renderScreen();

    expect(queryByText('€750k')).toBeNull();

    fireEvent.press(getByText('Recent'));
    await waitFor(() => {
      expect(getByText('€750k')).toBeTruthy();
    });
  });

  it('shows the union, deduped by id, when both pills are active', async () => {
    // One home is liked AND recently viewed; another is only recently viewed.
    const both = makeListing('lst_both', 500_000);
    toggleLike(both);
    recordRecentView(both);
    recordRecentView(makeListing('lst_seen', 750_000));
    const { getByText, getAllByText } = await renderScreen();

    fireEvent.press(getByText('Favorites'));
    await waitFor(() => {
      expect(getAllByText('€500k')).toHaveLength(1);
    });

    fireEvent.press(getByText('Recent'));
    await waitFor(() => {
      // Exactly one marker for the home in both stores — not two.
      expect(getAllByText('€500k')).toHaveLength(1);
      expect(getByText('€750k')).toBeTruthy();
    });
  });
});
