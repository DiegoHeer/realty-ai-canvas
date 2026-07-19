import type { ResidenceOut, ResidenceSummaryOut } from '../residences';
import {
  hasCoordinates,
  LISTING_TO_RESIDENCE_STATUS,
  residenceToListing,
  summaryToListing,
} from '../residences';

function makeResidence(overrides: Partial<ResidenceOut> = {}): ResidenceOut & { latitude: number; longitude: number } {
  return {
    id: 1,
    bag_id: 'BAG001',
    city: 'Den Haag',
    street: 'Kardoenhof',
    house_number: 53,
    house_letter: null,
    house_number_suffix: null,
    postcode: '2551 TW',
    slug: 'kardoenhof-53',
    latitude: 52.0705,
    longitude: 4.2689,
    neighbourhood: 'Morgenstond',
    district: 'Escamp',
    current_price_eur: 350000,
    current_status: 'new',
    last_scraped_at: '2026-06-01T12:00:00Z',
    status_changed_at: null,
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-06-01T12:00:00Z',
    listings: [
      {
        url: 'https://funda.nl/koop/den-haag/huis-1/',
        website: 'funda',
        first_seen_at: '2026-05-01T10:00:00Z',
        image_url: 'https://example.com/photo.jpg',
      },
    ],
    ...overrides,
  } as ResidenceOut & { latitude: number; longitude: number };
}

function makeSummary(
  overrides: Partial<ResidenceSummaryOut> = {},
): ResidenceSummaryOut & { latitude: number; longitude: number } {
  return {
    id: 7,
    city: 'Delft',
    street: 'Westvest',
    house_number: 36,
    house_letter: 'D',
    house_number_suffix: null,
    postcode: '2611AZ',
    slug: 'westvest-36d',
    latitude: 52.0079,
    longitude: 4.3575,
    current_price_eur: 675000,
    current_status: 'new',
    surface_area_m2: 120,
    bedroom_count: 3,
    bathroom_count: 2,
    energy_label: 'A',
    image_url: 'https://example.com/westvest.jpg',
    ...overrides,
  } as ResidenceSummaryOut & { latitude: number; longitude: number };
}

describe('summaryToListing', () => {
  it('maps the flattened list-item fields', () => {
    const listing = summaryToListing(makeSummary());

    expect(listing.id).toBe('7');
    expect(listing.title).toBe('Westvest 36D');
    expect(listing.price).toBe(675000);
    expect(listing.status).toBe('for_sale');
    expect(listing.bedrooms).toBe(3);
    expect(listing.bathrooms).toBe(2);
    expect(listing.areaSqm).toBe(120);
    expect(listing.energyLabel).toBe('A');
    expect(listing.address).toEqual({
      line1: 'Westvest 36D',
      city: 'Delft',
      postalCode: '2611AZ',
      country: 'NL',
    });
    expect(listing.location).toEqual({ latitude: 52.0079, longitude: 4.3575 });
    expect(listing.slug).toBe('westvest-36d');
  });

  it('leaves slug undefined when the API reports null', () => {
    const listing = summaryToListing(makeSummary({ slug: null }));
    expect(listing.slug).toBeUndefined();
  });

  it('wraps image_url in a single-image array', () => {
    const listing = summaryToListing(makeSummary());
    expect(listing.images).toEqual([
      { id: '7-0', url: 'https://example.com/westvest.jpg', alt: 'Westvest 36D' },
    ]);
  });

  it('produces an empty images array when image_url is null', () => {
    const listing = summaryToListing(makeSummary({ image_url: null }));
    expect(listing.images).toEqual([]);
  });

  it('defaults the numeric attributes to 0 when absent', () => {
    const listing = summaryToListing(
      makeSummary({
        current_price_eur: null,
        surface_area_m2: null,
        bedroom_count: null,
        bathroom_count: null,
      }),
    );
    expect(listing.price).toBe(0);
    expect(listing.areaSqm).toBe(0);
    expect(listing.bedrooms).toBe(0);
    expect(listing.bathrooms).toBe(0);
  });

  it('leaves createdAt unknown (the summary carries no timestamp)', () => {
    const listing = summaryToListing(makeSummary());
    expect(new Date(listing.createdAt).getTime()).toBeNaN();
  });
});

describe('residenceToListing', () => {
  it('maps all fields from a full residence', () => {
    const r = makeResidence();
    const listing = residenceToListing(r);

    expect(listing.id).toBe('1');
    expect(listing.title).toBe('Kardoenhof 53');
    expect(listing.price).toBe(350000);
    expect(listing.currency).toBe('EUR');
    expect(listing.status).toBe('for_sale');
    expect(listing.address).toEqual({
      line1: 'Kardoenhof 53',
      city: 'Den Haag',
      postalCode: '2551 TW',
      country: 'NL',
    });
    expect(listing.location).toEqual({ latitude: 52.0705, longitude: 4.2689 });
    expect(listing.createdAt).toBe('2026-05-01T10:00:00Z');
    expect(listing.sourceUrl).toBe('https://funda.nl/koop/den-haag/huis-1/');
    expect(listing.slug).toBe('kardoenhof-53');
  });

  it('leaves slug undefined when the API reports null', () => {
    const listing = residenceToListing(makeResidence({ slug: null }));
    expect(listing.slug).toBeUndefined();
  });

  it('concatenates house_letter and suffix into the address', () => {
    const r = makeResidence({ street: 'Burgemeester Rothestraat', house_number: 18, house_letter: 'N', house_number_suffix: null });
    const listing = residenceToListing(r);
    expect(listing.title).toBe('Burgemeester Rothestraat 18N');
  });

  it('concatenates house_number_suffix correctly', () => {
    const r = makeResidence({ street: 'Laan van Meerdervoort', house_number: 100, house_letter: null, house_number_suffix: 'bis' });
    const listing = residenceToListing(r);
    expect(listing.title).toBe('Laan van Meerdervoort 100bis');
  });

  it('falls back to city when street is null', () => {
    const r = makeResidence({ street: null, house_number: null });
    const listing = residenceToListing(r);
    expect(listing.title).toBe('Den Haag');
    expect(listing.address.line1).toBe('Den Haag');
  });

  it('defaults price to 0 when current_price_eur is null', () => {
    const r = makeResidence({ current_price_eur: null });
    const listing = residenceToListing(r);
    expect(listing.price).toBe(0);
  });

  it('produces empty images array when no listing has image_url', () => {
    const r = makeResidence({
      listings: [{ url: 'https://funda.nl/x', website: 'funda', first_seen_at: '2026-01-01T00:00:00Z', image_url: null }],
    });
    const listing = residenceToListing(r);
    expect(listing.images).toEqual([]);
  });

  it('extracts images from multiple source listings', () => {
    const r = makeResidence({
      listings: [
        { url: 'https://funda.nl/x', website: 'funda', first_seen_at: '2026-01-01T00:00:00Z', image_url: 'https://img1.jpg' },
        { url: 'https://pararius.nl/y', website: 'pararius', first_seen_at: '2026-01-01T00:00:00Z', image_url: 'https://img2.jpg' },
      ],
    });
    const listing = residenceToListing(r);
    expect(listing.images).toHaveLength(2);
    expect(listing.images[0]!.url).toBe('https://img1.jpg');
    expect(listing.images[1]!.url).toBe('https://img2.jpg');
  });

  it('sets postcode to empty string when null', () => {
    const r = makeResidence({ postcode: null });
    const listing = residenceToListing(r);
    expect(listing.address.postalCode).toBe('');
  });

  it('maps building_type and the foundation-risk fields', () => {
    const r = makeResidence({
      building_type: 'terraced',
      foundation_risk_label: 'Kwetsbaar gebied - 60-80 %',
      foundation_risk_soil_type: 'Zeekleigebied',
      foundation_risk_pre1970_pct: 75,
      foundation_risk_description: 'Lange Nederlandse uitleg…',
    });
    const listing = residenceToListing(r);
    expect(listing.buildingType).toBe('terraced');
    expect(listing.foundationRisk).toEqual({
      label: 'Kwetsbaar gebied - 60-80 %',
      soilType: 'Zeekleigebied',
      pre1970Pct: 75,
    });
  });

  it('leaves buildingType and foundationRisk undefined when absent', () => {
    const listing = residenceToListing(makeResidence());
    expect(listing.buildingType).toBeUndefined();
    expect(listing.foundationRisk).toBeUndefined();
  });

  it('builds a partial foundationRisk from whichever fields are present', () => {
    const listing = residenceToListing(makeResidence({ foundation_risk_soil_type: 'Duinen' }));
    expect(listing.foundationRisk).toEqual({ soilType: 'Duinen' });
  });

  it('prefers the flattened top-level attributes over the source listings', () => {
    const listing = residenceToListing(
      makeResidence({
        surface_area_m2: 246,
        bedroom_count: 3,
        bathroom_count: 1,
        energy_label: 'B',
        listings: [
          {
            url: 'https://funda.nl/x',
            website: 'funda',
            surface_area_m2: 200,
            bedroom_count: 5,
            bathroom_count: 2,
            energy_label: 'F',
          },
        ],
      }),
    );
    expect(listing.areaSqm).toBe(246);
    expect(listing.bedrooms).toBe(3);
    expect(listing.bathrooms).toBe(1);
    expect(listing.energyLabel).toBe('B');
  });

  it('falls back to build_year for constructionPeriod when no source reports one', () => {
    const listing = residenceToListing(makeResidence({ build_year: 1964 }));
    expect(listing.constructionPeriod).toBe('1964');
  });

  it('tolerates a residence without a listings array', () => {
    const listing = residenceToListing(makeResidence({ listings: undefined }));
    expect(listing.images).toEqual([]);
    expect(listing.sources).toEqual([]);
    expect(listing.sourceUrl).toBeUndefined();
  });
});

describe('hasCoordinates', () => {
  it('returns true when both latitude and longitude are present', () => {
    const r = makeResidence();
    expect(hasCoordinates(r)).toBe(true);
  });

  it('returns false when latitude is null', () => {
    const r = makeResidence({ latitude: null } as any);
    expect(hasCoordinates(r)).toBe(false);
  });

  it('returns false when longitude is null', () => {
    const r = makeResidence({ longitude: null } as any);
    expect(hasCoordinates(r)).toBe(false);
  });
});

describe('status mapping', () => {
  it('maps new → for_sale', () => {
    const listing = residenceToListing(makeResidence({ current_status: 'new' }));
    expect(listing.status).toBe('for_sale');
  });

  it('maps sale_pending → pending', () => {
    const listing = residenceToListing(makeResidence({ current_status: 'sale_pending' }));
    expect(listing.status).toBe('pending');
  });

  it('maps sold → sold', () => {
    const listing = residenceToListing(makeResidence({ current_status: 'sold' }));
    expect(listing.status).toBe('sold');
  });
});

describe('LISTING_TO_RESIDENCE_STATUS', () => {
  it('reverse-maps for_sale → new', () => {
    expect(LISTING_TO_RESIDENCE_STATUS.for_sale).toBe('new');
  });

  it('reverse-maps pending → sale_pending', () => {
    expect(LISTING_TO_RESIDENCE_STATUS.pending).toBe('sale_pending');
  });

  it('reverse-maps sold → sold', () => {
    expect(LISTING_TO_RESIDENCE_STATUS.sold).toBe('sold');
  });
});
