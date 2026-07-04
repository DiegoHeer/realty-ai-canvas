import { DataProvider, queryClient } from '@realty/data';
import { initI18n } from '@realty/i18n';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import MapScreen from '@/app/(tabs)/index';

afterEach(() => {
  queryClient.clear();
});

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
