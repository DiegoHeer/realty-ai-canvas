import { searchResidences } from '@realty/data';
import type { Listing } from '@realty/types';

import { geocode, lookup, lookupBuurt, suggest } from '@/lib/pdok';
import {
  resolvePick,
  resolveTyped,
  resultKey,
  resultLabel,
  resultType,
  suggestAll,
  suggestionCount,
  type SearchResult,
  type SearchSuggestion,
} from '@/lib/search';

jest.mock('@realty/data', () => ({ searchResidences: jest.fn() }));
jest.mock('@/lib/pdok', () => ({
  suggest: jest.fn(),
  lookup: jest.fn(),
  lookupBuurt: jest.fn(),
  geocode: jest.fn(),
}));

const mockSearchResidences = searchResidences as jest.Mock;
const mockSuggest = suggest as jest.Mock;
const mockLookup = lookup as jest.Mock;
const mockLookupBuurt = lookupBuurt as jest.Mock;
const mockGeocode = geocode as jest.Mock;

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: '42',
    title: 'Nice home',
    price: 500000,
    currency: 'EUR',
    status: 'for_sale',
    bedrooms: 3,
    bathrooms: 1,
    areaSqm: 90,
    address: { line1: 'Weena 5', city: 'Rotterdam', postalCode: '3012 CN', country: 'NL' },
    location: { longitude: 4.47, latitude: 51.92 },
    images: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: buurt-scoped call returns a buurt; unscoped/place call returns a place.
  mockSuggest.mockImplementation((_q: string, _signal?: AbortSignal, fq?: string) => {
    if (fq?.includes('buurt')) return Promise.resolve([{ id: 'b1', label: 'Grachtengordel', type: 'buurt' }]);
    return Promise.resolve([{ id: 'p1', label: 'Rotterdam', type: 'woonplaats' }]);
  });
  mockSearchResidences.mockResolvedValue([makeListing()]);
});

describe('suggestAll', () => {
  it('groups all three sources when requested', async () => {
    const groups = await suggestAll('weena', ['homes', 'buurten', 'places']);
    expect(groups.homes).toHaveLength(1);
    expect(groups.homes[0]).toMatchObject({ kind: 'residence', label: 'Weena 5, Rotterdam' });
    expect(groups.buurten[0]).toMatchObject({ kind: 'buurt', id: 'b1' });
    expect(groups.places[0]).toMatchObject({ kind: 'place', id: 'p1' });
    expect(suggestionCount(groups)).toBe(3);
  });

  it('excludes buurt/wijk from Places only when Buurten has its own section', async () => {
    await suggestAll('x', ['homes', 'buurten', 'places']);
    const placeFilters = mockSuggest.mock.calls.map((c) => c[2] as string | undefined);
    // One call scoped to buurt/wijk, one scoped to places-without-neighborhoods.
    expect(placeFilters.some((f) => f?.includes('buurt') && f.includes('wijk'))).toBe(true);
    expect(placeFilters.some((f) => f?.includes('woonplaats') && !f.includes('buurt'))).toBe(true);
  });

  it('leaves Places unfiltered when it is the only source (explore tab)', async () => {
    mockSuggest.mockResolvedValue([{ id: 'p1', label: 'Rotterdam', type: 'woonplaats' }]);
    const groups = await suggestAll('rot', ['places']);
    expect(mockSuggest).toHaveBeenCalledTimes(1);
    expect(mockSuggest.mock.calls[0][2]).toBeUndefined(); // no type filter
    expect(mockSearchResidences).not.toHaveBeenCalled();
    expect(groups.homes).toEqual([]);
  });

  it('fails a source independently — one rejection does not sink the others', async () => {
    mockSearchResidences.mockRejectedValue(new Error('backend down'));
    const groups = await suggestAll('x', ['homes', 'buurten', 'places']);
    expect(groups.homes).toEqual([]);
    expect(groups.buurten).toHaveLength(1);
    expect(groups.places).toHaveLength(1);
  });
});

describe('resolvePick', () => {
  it('returns a residence result without any network lookup', async () => {
    const listing = makeListing();
    const suggestion: SearchSuggestion = { kind: 'residence', id: '42', label: 'Weena 5', listing };
    const result = await resolvePick(suggestion);
    expect(result).toEqual({ kind: 'residence', listing });
    expect(mockLookup).not.toHaveBeenCalled();
    expect(mockLookupBuurt).not.toHaveBeenCalled();
  });

  it('looks up a place suggestion', async () => {
    mockLookup.mockResolvedValue({ label: 'Rotterdam', longitude: 4.47, latitude: 51.92, type: 'woonplaats' });
    const result = await resolvePick({ kind: 'place', id: 'p1', label: 'Rotterdam', type: 'woonplaats' });
    expect(mockLookup).toHaveBeenCalledWith('p1', undefined);
    expect(result).toMatchObject({ kind: 'place', result: { type: 'woonplaats' } });
  });

  it('looks up a buurt suggestion and carries its CBS codes', async () => {
    mockLookupBuurt.mockResolvedValue({
      label: 'Grachtengordel',
      longitude: 4.9,
      latitude: 52.37,
      gemeentecode: '0363',
      buurtcode: 'BU03630000',
    });
    const result = await resolvePick({ kind: 'buurt', id: 'b1', label: 'Grachtengordel', type: 'buurt' });
    expect(mockLookupBuurt).toHaveBeenCalledWith('b1', undefined);
    expect(result).toMatchObject({ kind: 'buurt', gemeentecode: '0363', buurtcode: 'BU03630000' });
  });

  it('returns null when a place lookup finds nothing', async () => {
    mockLookup.mockResolvedValue(null);
    expect(await resolvePick({ kind: 'place', id: 'x', label: 'x', type: 'weg' })).toBeNull();
  });
});

describe('resolveTyped', () => {
  it('wraps the top geocode hit as a place result', async () => {
    mockGeocode.mockResolvedValue({ label: 'Delft', longitude: 4.36, latitude: 52.01, type: 'woonplaats' });
    const result = await resolveTyped('delft');
    expect(mockGeocode).toHaveBeenCalledWith('delft', undefined);
    expect(result).toMatchObject({ kind: 'place', result: { label: 'Delft' } });
  });

  it('returns null when nothing matches', async () => {
    mockGeocode.mockResolvedValue(null);
    expect(await resolveTyped('zzz')).toBeNull();
  });
});

describe('resultLabel / resultKey / resultType', () => {
  const place: SearchResult = {
    kind: 'place',
    result: { label: 'Rotterdam', longitude: 4.47, latitude: 51.92, type: 'woonplaats' },
  };
  const buurt: SearchResult = {
    kind: 'buurt',
    label: 'Grachtengordel',
    longitude: 4.9,
    latitude: 52.37,
    gemeentecode: '0363',
    buurtcode: 'BU03630000',
  };
  const wijk: SearchResult = { ...buurt, label: 'Jordaan', buurtcode: null };
  const home: SearchResult = { kind: 'residence', listing: makeListing() };

  it('labels each kind', () => {
    expect(resultLabel(place)).toBe('Rotterdam');
    expect(resultLabel(buurt)).toBe('Grachtengordel');
    expect(resultLabel(home)).toBe('Weena 5, Rotterdam');
  });

  it('derives a type, distinguishing buurt from wijk and homes', () => {
    expect(resultType(place)).toBe('woonplaats');
    expect(resultType(buurt)).toBe('buurt');
    expect(resultType(wijk)).toBe('wijk');
    expect(resultType(home)).toBe('residence');
  });

  it('keys each kind distinctly for recents dedupe', () => {
    expect(resultKey(place)).toBe('place|Rotterdam|woonplaats');
    expect(resultKey(buurt)).toBe('buurt|BU03630000');
    expect(resultKey(home)).toBe('residence|42');
  });
});
