import type { Listing } from '@realty/types';

import { listingWebUrl } from '@/lib/listing-share-url';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: '11292',
    title: 'Martin Luther Kinglaan 129',
    price: 500000,
    currency: 'EUR',
    status: 'for_sale',
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 84,
    address: { line1: 'Martin Luther Kinglaan 129', city: 'Amsterdam', postalCode: '1011 AB', country: 'NL' },
    location: { latitude: 52.37, longitude: 4.89 },
    images: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    slug: 'martin-luther-kinglaan-129',
    ...overrides,
  };
}

describe('listingWebUrl', () => {
  it('builds the locale/slug/id URL', () => {
    expect(listingWebUrl(makeListing(), 'nl')).toBe(
      'https://huismusapp.com/nl/listing/martin-luther-kinglaan-129/11292',
    );
  });

  it('falls back to the default language for an unsupported locale', () => {
    expect(listingWebUrl(makeListing(), 'de')).toBe(
      'https://huismusapp.com/en/listing/martin-luther-kinglaan-129/11292',
    );
  });

  it('falls back to repeating the id when there is no slug', () => {
    expect(listingWebUrl(makeListing({ slug: undefined }), 'nl')).toBe(
      'https://huismusapp.com/nl/listing/11292/11292',
    );
  });
});
