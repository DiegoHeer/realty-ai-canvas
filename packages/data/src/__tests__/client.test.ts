import { getAreas, getListing, getListings } from '../client';
import { mockListings } from '../mocks';

// ---- Mock-mode tests ----
// By default USE_MOCKS is true when EXPO_PUBLIC_API_URL is empty.

describe('client (mock mode)', () => {
  describe('getListings', () => {
    it('returns all mock listings when no query is given', async () => {
      const listings = await getListings();
      expect(listings).toHaveLength(mockListings.length);
    });

    it('filters by status', async () => {
      const listings = await getListings({ status: 'for_sale' });
      expect(listings.length).toBeGreaterThan(0);
      expect(listings.every((l) => l.status === 'for_sale')).toBe(true);
    });

    it('filters by minPrice', async () => {
      const listings = await getListings({ minPrice: 1000000 });
      expect(listings.length).toBeGreaterThan(0);
      expect(listings.every((l) => l.price >= 1000000)).toBe(true);
    });

    it('filters by maxPrice', async () => {
      const listings = await getListings({ maxPrice: 600000 });
      expect(listings.length).toBeGreaterThan(0);
      expect(listings.every((l) => l.price <= 600000)).toBe(true);
    });

    it('filters by price range', async () => {
      const listings = await getListings({ minPrice: 500000, maxPrice: 700000 });
      expect(listings.length).toBeGreaterThan(0);
      expect(listings.every((l) => l.price >= 500000 && l.price <= 700000)).toBe(true);
    });

    it('filters by case-insensitive search', async () => {
      const listings = await getListings({ search: 'canal' });
      expect(listings.length).toBeGreaterThan(0);
      expect(
        listings.every((l) => {
          const haystack = `${l.title} ${l.address.line1} ${l.address.city}`.toLowerCase();
          return haystack.includes('canal');
        }),
      ).toBe(true);
    });

    it('returns empty array when search matches nothing', async () => {
      const listings = await getListings({ search: 'xyznonexistent' });
      expect(listings).toEqual([]);
    });
  });

  describe('getListing', () => {
    it('returns the matching listing by id', async () => {
      const listing = await getListing('lst_001');
      expect(listing.id).toBe('lst_001');
      expect(listing.title).toBe('Bright canal-side apartment');
    });

    it('throws when listing is not found', async () => {
      await expect(getListing('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('getAreas', () => {
    it('returns an empty array when no backend is configured', async () => {
      const areas = await getAreas();
      expect(areas).toEqual([]);
    });
  });
});

// ---- API-mode tests ----
// These tests need a fresh module graph with USE_MOCKS=false.
// We use jest.mock to override the env module before client.ts imports it.

describe('client (API mode)', () => {
  const mockResidences = [
    {
      id: 10,
      bag_id: 'BAG010',
      city: 'Den Haag',
      street: 'Laan',
      house_number: 1,
      house_letter: null,
      house_number_suffix: null,
      postcode: '2500 AA',
      latitude: 52.07,
      longitude: 4.27,
      neighbourhood: null,
      district: null,
      current_price_eur: 200000,
      current_status: 'new' as const,
      last_scraped_at: null,
      status_changed_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      listings: [],
    },
    {
      id: 11,
      bag_id: 'BAG011',
      city: 'Den Haag',
      street: 'Straat',
      house_number: 2,
      house_letter: null,
      house_number_suffix: null,
      postcode: '2500 BB',
      latitude: null,
      longitude: null,
      neighbourhood: null,
      district: null,
      current_price_eur: 300000,
      current_status: 'new' as const,
      last_scraped_at: null,
      status_changed_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      listings: [],
    },
  ];

  // Re-import client with mocked env for each test
  let getListingsApi: typeof getListings;
  let getAreasApi: typeof getAreas;
  let getStatsApi: typeof import('../client').getStats;
  let getCitiesApi: typeof import('../client').getCities;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../env', () => ({
      USE_MOCKS: false,
      API_BASE: 'https://api.example.com',
      API_URL: 'https://api.example.com',
    }));
    global.fetch = jest.fn();

    // Re-require after mocking env
    const client = require('../client');
    getListingsApi = client.getListings;
    getAreasApi = client.getAreas;
    getStatsApi = client.getStats;
    getCitiesApi = client.getCities;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getListings calls fetch with correct URL and filters non-geocoded residences', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResidences,
    });

    const listings = await getListingsApi();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const url = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
    expect(url).toContain('/v1/residences');
    // Only the geocoded residence (id:10) should be returned
    expect(listings).toHaveLength(1);
    expect(listings[0]!.id).toBe('10');
  });

  it('getListings passes status filter as query param', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await getListingsApi({ status: 'for_sale' });
    const url = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
    expect(url).toContain('status=new');
  });

  it('getListings applies client-side search after API fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockResidences[0]],
    });

    const listings = await getListingsApi({ search: 'laan' });
    expect(listings).toHaveLength(1);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockResidences[0]],
    });

    const noMatch = await getListingsApi({ search: 'xyznotfound' });
    expect(noMatch).toHaveLength(0);
  });

  it('getAreas fetches neighborhood shapes and transforms them', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          code: 'BU05180546',
          name: 'Archipelbuurt',
          city_code: '0518',
          district_code: 'WK051805',
          geometry: [[[[4.3, 52.0], [4.31, 52.0], [4.31, 52.01], [4.3, 52.0]]]],
        },
        {
          code: 'BU05180478',
          name: 'Arendsdorp',
          city_code: '0518',
          district_code: 'WK051804',
          geometry: [[[[4.32, 52.09], [4.33, 52.09], [4.33, 52.1], [4.32, 52.09]]]],
        },
      ],
    });

    const areas = await getAreasApi();

    const url = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
    expect(url).toContain('/v1/shapes/neighborhoods?city=0518');
    expect(areas).toHaveLength(2);
    expect(areas[0]).toMatchObject({
      id: 'BU05180546',
      name: 'Archipelbuurt',
      geometry: { type: 'MultiPolygon' },
    });
    // Each distinct district gets a distinct color.
    expect(areas[0]!.color).not.toBe(areas[1]!.color);
  });

  it('getCities pages through all results (limit 200) and wraps the geometry', async () => {
    // A full page (200) forces a second request; the short second page ends it.
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      code: String(i).padStart(4, '0'),
      name: `City ${i}`,
      geometry: [[[4.3, 52.0], [4.31, 52.0], [4.31, 52.01], [4.3, 52.0]]], // Polygon
    }));
    const lastPage = [
      {
        code: '9999',
        name: 'Laatste',
        geometry: [[[[4.4, 52.1], [4.41, 52.1], [4.41, 52.11], [4.4, 52.1]]]], // MultiPolygon
      },
    ];
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => fullPage })
      .mockResolvedValueOnce({ ok: true, json: async () => lastPage });

    const cities = await getCitiesApi();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toContain('/v1/shapes/cities?limit=200&offset=0');
    expect(urls[1]).toContain('offset=200');
    expect(cities).toHaveLength(201);
    expect(cities[0]).toMatchObject({ code: '0000', name: 'City 0', geometry: { type: 'Polygon' } });
    expect(cities[200]).toMatchObject({ code: '9999', geometry: { type: 'MultiPolygon' } });
  });

  it('getStats fetches neighborhood stats and maps stats_year → statsYear', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          code: 'BU05180546',
          name: 'Archipelbuurt',
          stats_year: 2023,
          stats: { AantalInwoners_5: 6285, Koopwoningen_41: 54 },
          geometry: [[[[4.3, 52.0]]]],
        },
      ],
    });

    const stats = await getStatsApi();

    const url = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
    expect(url).toContain('/v1/stats/neighborhoods?city=0518');
    expect(stats).toEqual([
      { code: 'BU05180546', statsYear: 2023, stats: { AantalInwoners_5: 6285, Koopwoningen_41: 54 } },
    ]);
  });

  it('request throws on non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(getListingsApi()).rejects.toThrow('500');
  });
});
