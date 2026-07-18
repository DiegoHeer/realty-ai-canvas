import type { Page, Route } from '@playwright/test';

/**
 * Deterministic stand-in for the live residence endpoints, used to make the
 * data-driven visual specs reproducible. The app itself has no bundled data
 * (mocks were removed — see packages/data); this is test-layer network stubbing,
 * the Playwright equivalent of the package's Jest fetch mocks. Objects mirror the
 * `ResidenceOut` schema from packages/data/src/residences.ts — the detail
 * endpoint serves them as-is, while the list endpoint serves the flattened
 * `ResidenceSummaryOut` projection derived below.
 *
 * Residence id 1 (Prinsengracht 412) is the one the listing-detail spec opens.
 */
const RESIDENCES = [
  {
    id: 1,
    bag_id: 'BAG0001',
    city: 'Amsterdam',
    street: 'Prinsengracht',
    house_number: 412,
    house_letter: null,
    house_number_suffix: null,
    postcode: '1016 JA',
    latitude: 52.3676,
    longitude: 4.884,
    neighbourhood: 'Grachtengordel',
    district: 'Centrum',
    building_type: 'apartment',
    foundation_risk_label: 'Kwetsbaar gebied - 60-80 %',
    foundation_risk_soil_type: 'Zeekleigebied',
    foundation_risk_pre1970_pct: 75,
    foundation_risk_description: null,
    current_price_eur: 675000,
    current_status: 'new',
    last_scraped_at: null,
    status_changed_at: null,
    created_at: '2026-05-02T09:00:00.000Z',
    updated_at: '2026-05-02T09:00:00.000Z',
    listings: [
      {
        url: 'https://example.com/funda/1',
        website: 'funda',
        first_seen_at: '2026-05-02T09:00:00.000Z',
        surface_area_m2: 84,
        bedroom_count: 2,
        bathroom_count: 1,
        room_count: 3,
        construction_period: '1910',
        energy_label: 'B',
      },
    ],
  },
  {
    id: 2,
    bag_id: 'BAG0002',
    city: 'Amsterdam',
    street: 'Vondelstraat',
    house_number: 78,
    house_letter: null,
    house_number_suffix: null,
    postcode: '1054 GK',
    latitude: 52.3584,
    longitude: 4.8686,
    neighbourhood: 'Vondelpark',
    district: 'Zuid',
    building_type: 'apartment',
    foundation_risk_label: null,
    foundation_risk_soil_type: null,
    foundation_risk_pre1970_pct: null,
    foundation_risk_description: null,
    current_price_eur: 1250000,
    current_status: 'new',
    last_scraped_at: null,
    status_changed_at: null,
    created_at: '2026-05-10T12:30:00.000Z',
    updated_at: '2026-05-10T12:30:00.000Z',
    listings: [
      {
        url: 'https://example.com/funda/2',
        website: 'funda',
        first_seen_at: '2026-05-10T12:30:00.000Z',
        surface_area_m2: 142,
        bedroom_count: 3,
        bathroom_count: 2,
        room_count: 4,
        construction_period: '2018',
        energy_label: 'A',
      },
    ],
  },
  {
    id: 3,
    bag_id: 'BAG0003',
    city: 'Amsterdam',
    street: 'Egelantiersgracht',
    house_number: 22,
    house_letter: null,
    house_number_suffix: null,
    postcode: '1015 RL',
    latitude: 52.3766,
    longitude: 4.8826,
    neighbourhood: 'Jordaan',
    district: 'Centrum',
    building_type: 'terraced',
    foundation_risk_label: 'Kwetsbaar gebied - 80-100 %',
    foundation_risk_soil_type: 'Laagveengebied',
    foundation_risk_pre1970_pct: 95,
    foundation_risk_description: null,
    current_price_eur: 1875000,
    current_status: 'sale_pending',
    last_scraped_at: null,
    status_changed_at: null,
    created_at: '2026-04-28T15:45:00.000Z',
    updated_at: '2026-04-28T15:45:00.000Z',
    listings: [
      {
        url: 'https://example.com/pararius/3',
        website: 'pararius',
        first_seen_at: '2026-04-28T15:45:00.000Z',
        surface_area_m2: 196,
        bedroom_count: 4,
        bathroom_count: 2,
        room_count: 5,
        construction_period: '1925',
        energy_label: 'C',
      },
    ],
  },
  {
    id: 4,
    bag_id: 'BAG0004',
    city: 'Amsterdam',
    street: 'Krijn Taconiskade',
    house_number: 410,
    house_letter: null,
    house_number_suffix: null,
    postcode: '1087 HW',
    latitude: 52.3531,
    longitude: 4.9923,
    neighbourhood: 'IJburg',
    district: 'Oost',
    building_type: 'apartment',
    foundation_risk_label: 'Niet kwetsbaar gebied - 0-20 %',
    foundation_risk_soil_type: 'Hogere Zandgronden',
    foundation_risk_pre1970_pct: 0,
    foundation_risk_description: null,
    current_price_eur: 2150000,
    current_status: 'new',
    last_scraped_at: null,
    status_changed_at: null,
    created_at: '2026-05-22T10:05:00.000Z',
    updated_at: '2026-05-22T10:05:00.000Z',
    listings: [
      {
        url: 'https://example.com/funda/4',
        website: 'funda',
        first_seen_at: '2026-05-22T10:05:00.000Z',
        surface_area_m2: 168,
        bedroom_count: 3,
        bathroom_count: 3,
        room_count: 4,
        construction_period: '2016',
        energy_label: 'A',
      },
    ],
  },
  {
    id: 5,
    bag_id: 'BAG0005',
    city: 'Amsterdam',
    street: "'s-Gravesandestraat",
    house_number: 51,
    house_letter: null,
    house_number_suffix: null,
    postcode: '1092 AA',
    latitude: 52.3597,
    longitude: 4.9203,
    neighbourhood: 'Oosterpark',
    district: 'Oost',
    building_type: 'apartment',
    foundation_risk_label: null,
    foundation_risk_soil_type: null,
    foundation_risk_pre1970_pct: null,
    foundation_risk_description: null,
    current_price_eur: 545000,
    current_status: 'new',
    last_scraped_at: null,
    status_changed_at: null,
    created_at: '2026-05-30T11:20:00.000Z',
    updated_at: '2026-05-30T11:20:00.000Z',
    listings: [
      {
        url: 'https://example.com/vastgoed/5',
        website: 'vastgoed_nl',
        first_seen_at: '2026-05-30T11:20:00.000Z',
        surface_area_m2: 72,
        bedroom_count: 2,
        bathroom_count: 1,
        room_count: 3,
        construction_period: '1930',
        energy_label: 'D',
      },
    ],
  },
];

/**
 * The list endpoint's flattened `ResidenceSummaryOut` projection of the fixtures
 * above: per-source attributes pre-merged onto the item, no `listings` array —
 * mirroring what the backend serves (see packages/data/src/residences.ts).
 */
const SUMMARIES = RESIDENCES.map(
  ({ id, city, street, house_number, house_letter, house_number_suffix, postcode,
     latitude, longitude, current_price_eur, current_status, listings }) => ({
    id, city, street, house_number, house_letter, house_number_suffix, postcode,
    latitude, longitude, current_price_eur, current_status,
    surface_area_m2: listings[0]?.surface_area_m2 ?? null,
    bedroom_count: listings[0]?.bedroom_count ?? null,
    bathroom_count: listings[0]?.bathroom_count ?? null,
    energy_label: listings[0]?.energy_label ?? null,
    image_url: null,
  }),
);

function json(route: Route, payload: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

/**
 * Intercept the residence/geo endpoints with deterministic fixtures so screenshots
 * don't depend on live staging data. `/v1/residences` answers three call shapes:
 * the detail path (`getListing`, `/v1/residences/{id}` → full `ResidenceOut`),
 * the count-only envelope (`limit=0`), and the paginated summary envelope
 * (`getListings`). Shapes, stats and city-names resolve to empty arrays — none
 * are rendered by these specs.
 */
export async function stubApi(page: Page): Promise<void> {
  await page.route('**/v1/residences**', (route) => {
    const url = new URL(route.request().url());
    const detailId = /\/v1\/residences\/(\d+)$/.exec(url.pathname)?.[1];
    if (detailId) {
      // getListing() fetches the full residence from the detail endpoint.
      const found = RESIDENCES.find((r) => String(r.id) === detailId);
      return found ? json(route, found) : route.fulfill({ status: 404 });
    }
    if (url.searchParams.get('limit') === '0') {
      // getListingsCount() count-only mode.
      return json(route, { items: [], total: SUMMARIES.length, limit: 0, offset: 0, has_more: false });
    }
    // getListings() paginated envelope of flattened summaries.
    return json(route, {
      items: SUMMARIES,
      total: SUMMARIES.length,
      limit: 100,
      offset: 0,
      has_more: false,
    });
  });
  await page.route('**/v1/shapes/**', (route) => json(route, []));
  await page.route('**/v1/stats/**', (route) => json(route, []));
  await page.route('**/v1/cities**', (route) => json(route, []));
}
