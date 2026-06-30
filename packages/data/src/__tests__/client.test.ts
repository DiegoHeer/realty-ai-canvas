import { getAreas, getCityNames, getListing, getListings, getListingsCount } from '../client';
import { mockCityNames, mockListings } from '../mocks';

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

    it('filters by deal type (sale excludes rentals)', async () => {
      const listings = await getListings({ dealType: 'sale' });
      expect(listings.length).toBeGreaterThan(0);
      expect(listings.every((l) => l.status !== 'for_rent')).toBe(true);
    });

    it('filters by building type', async () => {
      const listings = await getListings({ buildingTypes: ['terraced'] });
      expect(listings.length).toBeGreaterThan(0);
      expect(listings.every((l) => l.buildingType === 'terraced')).toBe(true);
    });

    it('filters by minimum bedrooms', async () => {
      const listings = await getListings({ minBedrooms: 3 });
      expect(listings.length).toBeGreaterThan(0);
      expect(listings.every((l) => l.bedrooms >= 3)).toBe(true);
    });

    it('filters by energy label set', async () => {
      const listings = await getListings({ energyLabels: ['A'] });
      expect(listings.length).toBeGreaterThan(0);
      expect(listings.every((l) => l.energyLabel === 'A')).toBe(true);
    });

    it('filters by minimum build year, excluding older/unparseable homes', async () => {
      const listings = await getListings({ minBuildYear: 2000 });
      expect(listings.length).toBeGreaterThan(0);
      expect(
        listings.every((l) => {
          const match = l.constructionPeriod?.match(/\d{4}/);
          return match != null && Number.parseInt(match[0], 10) >= 2000;
        }),
      ).toBe(true);
    });
  });

  describe('getListingsCount', () => {
    it('counts all mock listings when unfiltered', async () => {
      expect(await getListingsCount()).toBe(mockListings.length);
    });

    it('counts only listings matching the filters', async () => {
      const count = await getListingsCount({ buildingTypes: ['terraced'] });
      const listings = await getListings({ buildingTypes: ['terraced'] });
      expect(count).toBe(listings.length);
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

  describe('getCityNames', () => {
    it('returns the bundled sample list when no backend is configured', async () => {
      const cities = await getCityNames();
      expect(cities).toEqual(mockCityNames);
      // The largest cities back the onboarding picker's pills, so they must be present.
      expect(cities.some((c) => c.name === 'Amsterdam')).toBe(true);
      expect(cities.some((c) => c.name === 'Rotterdam')).toBe(true);
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
  let getListingsCountApi: typeof getListingsCount;
  let getAreasApi: typeof getAreas;
  let getStatsApi: typeof import('../client').getStats;
  let getCitiesApi: typeof import('../client').getCities;
  let getCityNamesApi: typeof getCityNames;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../env', () => ({
      USE_MOCKS: false,
      API_BASE: 'https://api.example.com',
      API_URL: 'https://api.example.com',
      API_VERSION: 2,
    }));
    global.fetch = jest.fn();

    // Re-require after mocking env
    const client = require('../client');
    getListingsApi = client.getListings;
    getListingsCountApi = client.getListingsCount;
    getAreasApi = client.getAreas;
    getStatsApi = client.getStats;
    getCitiesApi = client.getCities;
    getCityNamesApi = client.getCityNames;
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

  it('getListings sends api_version and maps every filter to a query param', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => [] });

    await getListingsApi({
      dealType: 'sale',
      minPrice: 300000,
      maxPrice: 600000,
      buildingTypes: ['apartment', 'terraced'],
      minBedrooms: 2,
      minBathrooms: 1,
      minAreaSqm: 70,
      maxAreaSqm: 150,
      energyLabels: ['A', 'B'],
      minBuildYear: 1990,
      sort: 'price_asc',
    });

    const url = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
    expect(url).toContain('api_version=2');
    expect(url).toContain('deal_type=sale');
    expect(url).toContain('min_price=300000');
    expect(url).toContain('max_price=600000');
    // Multi-value facets repeat the param (OR-combined server-side).
    expect(url).toContain('building_type=apartment');
    expect(url).toContain('building_type=terraced');
    expect(url).toContain('min_bedrooms=2');
    expect(url).toContain('min_bathrooms=1');
    expect(url).toContain('min_area_m2=70');
    expect(url).toContain('max_area_m2=150');
    expect(url).toContain('energy_label=A');
    expect(url).toContain('energy_label=B');
    expect(url).toContain('min_build_year=1990');
    expect(url).toContain('sort=price_asc');
    expect(url).toContain('limit=100');
  });

  it('getListings parses the v2 ResidencePage envelope', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: mockResidences, total: 42, limit: 100, offset: 0, has_more: false }),
    });

    const listings = await getListingsApi();
    // Only the geocoded residence (id:10) survives.
    expect(listings).toHaveLength(1);
    expect(listings[0]!.id).toBe('10');
  });

  it('getListingsCount requests a count-only page and returns the envelope total', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 142, limit: 0, offset: 0, has_more: true }),
    });

    const count = await getListingsCountApi({ sort: 'price_asc' });
    expect(count).toBe(142);
    const url = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
    expect(url).toContain('limit=0');
    expect(url).toContain('api_version=2');
    // Ordering is irrelevant to a count, so `sort` is omitted.
    expect(url).not.toContain('sort=');
  });

  it('getListingsCount tolerates a legacy bare array (counts its length)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResidences,
    });

    expect(await getListingsCountApi()).toBe(mockResidences.length);
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
    // Pin the geom format explicitly so a future server-side `topojson` default
    // can't change what this client receives.
    expect(url).toContain('format=geojson');
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
    // Every page pins the geom format (see getAreas test for the rationale).
    expect(urls.every((u) => u.includes('format=geojson'))).toBe(true);
    expect(cities).toHaveLength(201);
    expect(cities[0]).toMatchObject({ code: '0000', name: 'City 0', geometry: { type: 'Polygon' } });
    expect(cities[200]).toMatchObject({ code: '9999', geometry: { type: 'MultiPolygon' } });
  });

  it('getCityNames fetches the lightweight /v1/cities list', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { code: '0518', name: "'s-Gravenhage" },
        { code: '0363', name: 'Amsterdam' },
      ],
    });

    const cities = await getCityNamesApi();

    const url = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
    expect(url).toContain('/v1/cities');
    // The lightweight endpoint carries no geometry — unlike /v1/shapes/cities.
    expect(url).not.toContain('/shapes/');
    expect(cities).toEqual([
      { code: '0518', name: "'s-Gravenhage" },
      { code: '0363', name: 'Amsterdam' },
    ]);
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
