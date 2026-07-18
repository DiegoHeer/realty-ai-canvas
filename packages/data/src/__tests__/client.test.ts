import { getAreas, getCityNames, getListings, getListingsCount } from '../client';

// The client always talks to the real backend now (mocks were removed). These
// tests mock `fetch` so they exercise URL construction and the residence →
// listing transform without a live API.

// ---- "No backend configured" tests ----
// With no API_URL set, the shape/stat/city-name endpoints resolve to empty
// arrays rather than failing (so the map renders without overlays).

describe('client (no backend configured)', () => {
  it('getAreas returns an empty array', async () => {
    expect(await getAreas()).toEqual([]);
  });

  it('getCityNames returns an empty array', async () => {
    expect(await getCityNames()).toEqual([]);
  });
});

// ---- API-mode tests ----
// These need a fresh module graph with API_URL set; jest.mock overrides the env
// module before client.ts imports it.

describe('client (API mode)', () => {
  // List items are the flattened `ResidenceSummaryOut` shape — no `listings`
  // array; the per-source attributes are pre-merged server-side.
  const mockResidences = [
    {
      id: 10,
      city: 'Den Haag',
      street: 'Laan',
      house_number: 1,
      house_letter: null,
      house_number_suffix: null,
      postcode: '2500 AA',
      slug: 'laan-1',
      latitude: 52.07,
      longitude: 4.27,
      current_price_eur: 200000,
      current_status: 'new' as const,
      surface_area_m2: 95,
      bedroom_count: 2,
      bathroom_count: 1,
      energy_label: 'B',
      image_url: 'https://example.com/laan-1.jpg',
    },
    {
      id: 11,
      city: 'Den Haag',
      street: 'Straat',
      house_number: 2,
      house_letter: null,
      house_number_suffix: null,
      postcode: '2500 BB',
      slug: 'straat-2',
      latitude: null,
      longitude: null,
      current_price_eur: 300000,
      current_status: 'new' as const,
      surface_area_m2: null,
      bedroom_count: null,
      bathroom_count: null,
      energy_label: null,
      image_url: null,
    },
  ];

  // Re-import client with mocked env for each test
  let getListingsApi: typeof getListings;
  let getListingsCountApi: typeof getListingsCount;
  let getListingApi: typeof import('../client').getListing;
  let getAreasApi: typeof getAreas;
  let getStatsApi: typeof import('../client').getStats;
  let getCitiesApi: typeof import('../client').getCities;
  let getCityNamesApi: typeof getCityNames;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../env', () => ({
      API_BASE: 'https://api.example.com',
      API_URL: 'https://api.example.com',
      API_VERSION: 2,
    }));
    global.fetch = jest.fn();

    // Re-require after mocking env
    const client = require('../client');
    getListingsApi = client.getListings;
    getListingsCountApi = client.getListingsCount;
    getListingApi = client.getListing;
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
    // Every request carries the active UI language so the backend can
    // localize transactional emails; defaults to 'en' before initI18n runs.
    const headers = (global.fetch as jest.Mock).mock.calls[0]![1].headers;
    expect(headers['Accept-Language']).toBe('en');
    // Only the geocoded residence (id:10) should be returned
    expect(listings).toHaveLength(1);
    expect(listings[0]!.id).toBe('10');
    // The flattened summary attributes land on the listing.
    expect(listings[0]).toMatchObject({
      areaSqm: 95,
      bedrooms: 2,
      bathrooms: 1,
      energyLabel: 'B',
      images: [{ id: '10-0', url: 'https://example.com/laan-1.jpg', alt: 'Laan 1' }],
    });
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

  it('getListing fetches the detail endpoint and maps the full residence', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 10,
        bag_id: 'BAG010',
        city: 'Den Haag',
        street: 'Laan',
        house_number: 1,
        house_letter: null,
        house_number_suffix: null,
        postcode: '2500 AA',
        slug: 'laan-1',
        latitude: 52.07,
        longitude: 4.27,
        neighbourhood: null,
        district: null,
        surface_area_m2: 95,
        bedroom_count: 2,
        bathroom_count: 1,
        build_year: 1964,
        energy_label: 'B',
        current_price_eur: 200000,
        current_status: 'new',
        last_scraped_at: null,
        status_changed_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        listings: [
          {
            url: 'https://funda.nl/koop/den-haag/huis-10/',
            website: 'funda',
            image_url: 'https://example.com/laan-1.jpg',
            room_count: 4,
          },
        ],
      }),
    });

    const listing = await getListingApi('10');

    const url = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
    expect(url).toContain('/v1/residences/10');
    expect(listing).toMatchObject({
      id: '10',
      areaSqm: 95,
      roomCount: 4,
      constructionPeriod: '1964',
      createdAt: '2026-01-01T00:00:00Z',
      sourceUrl: 'https://funda.nl/koop/den-haag/huis-10/',
      sources: [{ url: 'https://funda.nl/koop/den-haag/huis-10/', name: 'Funda' }],
      slug: 'laan-1',
    });
  });

  it('getListing rejects a residence without coordinates', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
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
        current_status: 'new',
        last_scraped_at: null,
        status_changed_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        listings: [],
      }),
    });

    await expect(getListingApi('11')).rejects.toThrow('Listing 11 not found');
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
      {
        code: 'BU05180546',
        statsYear: 2023,
        stats: { AantalInwoners_5: 6285, Koopwoningen_41: 54 },
        election: null,
      },
    ]);
  });

  it('getStats maps election_stats to the most recent period', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          code: 'BU05180546',
          stats_year: 2023,
          stats: {},
          election_stats: {
            // Out of order and multi-period to prove the newest wins.
            tk2023: { source: 'buurt', totalVotes: 10, parties: { VVD: 10 } },
            tk2025: { source: 'buurt', totalVotes: 100, parties: { VVD: 60, D66: 40 } },
          },
        },
      ],
    });

    const [entry] = await getStatsApi();

    expect(entry!.election).toEqual({
      period: 'tk2025',
      source: 'buurt',
      totalVotes: 100,
      parties: { VVD: 60, D66: 40 },
    });
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
