import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AreaPolygon, NeighborhoodStats } from '@realty/types';

import { loadAreas, loadStats } from '@/lib/area-cache';

// Mock the data layer so we can assert whether the network loaders are called.
const mockGetAreas = jest.fn();
const mockGetStats = jest.fn();
jest.mock('@realty/data', () => ({
  getAreas: (city: string) => mockGetAreas(city),
  getStats: (city: string) => mockGetStats(city),
}));

const DEN_HAAG = '0518';
const AMSTERDAM = '0363';

const sampleAreas: AreaPolygon[] = [
  {
    id: 'BU05180546',
    name: 'Archipelbuurt',
    color: '#2563eb',
    geometry: { type: 'MultiPolygon', coordinates: [[[[4.3, 52.0], [4.31, 52.0], [4.31, 52.01], [4.3, 52.0]]]] },
  },
];

const sampleStats: NeighborhoodStats[] = [
  { code: 'BU05180546', statsYear: 2023, stats: { AantalInwoners_5: 6285 } },
];

beforeEach(async () => {
  await AsyncStorage.clear();
  mockGetAreas.mockReset();
  mockGetStats.mockReset();
});

describe('loadAreas', () => {
  it('fetches from the API and caches under the city code on a miss', async () => {
    mockGetAreas.mockResolvedValueOnce(sampleAreas);

    const areas = await loadAreas(DEN_HAAG);

    expect(mockGetAreas).toHaveBeenCalledWith(DEN_HAAG);
    expect(areas).toEqual(sampleAreas);
    const raw = await AsyncStorage.getItem(`realty:areas:${DEN_HAAG}`);
    expect(JSON.parse(raw!)).toEqual(sampleAreas);
  });

  it('returns the cached data without calling the API when the cache exists', async () => {
    await AsyncStorage.setItem(`realty:areas:${DEN_HAAG}`, JSON.stringify(sampleAreas));

    const areas = await loadAreas(DEN_HAAG);

    expect(mockGetAreas).not.toHaveBeenCalled();
    expect(areas).toEqual(sampleAreas);
  });

  it('caches each city under its own key', async () => {
    mockGetAreas.mockResolvedValue(sampleAreas);

    await loadAreas(DEN_HAAG);
    await loadAreas(AMSTERDAM);

    expect(mockGetAreas).toHaveBeenCalledWith(DEN_HAAG);
    expect(mockGetAreas).toHaveBeenCalledWith(AMSTERDAM);
    expect(await AsyncStorage.getItem(`realty:areas:${DEN_HAAG}`)).not.toBeNull();
    expect(await AsyncStorage.getItem(`realty:areas:${AMSTERDAM}`)).not.toBeNull();
  });

  it('does not cache an empty result, so it retries next time', async () => {
    mockGetAreas.mockResolvedValueOnce([]);

    const areas = await loadAreas(DEN_HAAG);

    expect(areas).toEqual([]);
    expect(await AsyncStorage.getItem(`realty:areas:${DEN_HAAG}`)).toBeNull();
  });
});

describe('loadStats', () => {
  it('fetches from the API and caches under its own city-scoped key on a miss', async () => {
    mockGetStats.mockResolvedValueOnce(sampleStats);

    const stats = await loadStats(DEN_HAAG);

    expect(mockGetStats).toHaveBeenCalledWith(DEN_HAAG);
    expect(stats).toEqual(sampleStats);
    const raw = await AsyncStorage.getItem(`realty:stats:${DEN_HAAG}`);
    expect(JSON.parse(raw!)).toEqual(sampleStats);
  });

  it('returns the cached stats without calling the API when the cache exists', async () => {
    await AsyncStorage.setItem(`realty:stats:${DEN_HAAG}`, JSON.stringify(sampleStats));

    const stats = await loadStats(DEN_HAAG);

    expect(mockGetStats).not.toHaveBeenCalled();
    expect(stats).toEqual(sampleStats);
  });
});
