import { DataProvider, queryClient } from '@realty/data';
import { render, waitFor } from '@testing-library/react-native';

import MapScreen from '@/app/(tabs)/index';

afterEach(() => {
  queryClient.clear();
});

async function renderScreen() {
  return render(
    <DataProvider>
      <MapScreen />
    </DataProvider>,
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
});
