import { searchResidences } from '@realty/data';
import type { Listing } from '@realty/types';

import { geocode, lookup, lookupBuurt, suggest } from '@/lib/pdok';
import {
  resolvePick,
  resolveTyped,
  resultKey,
  resultLabel,
  resultType,
  splitSuggestionLabel,
  suggestAll,
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
    if (fq?.includes('buurt'))
      return Promise.resolve([
        { id: 'b1', label: 'Grachtengordel', type: 'buurt', longitude: 4.89, latitude: 52.37 },
      ]);
    return Promise.resolve([
      { id: 'p1', label: 'Rotterdam', type: 'woonplaats', longitude: 4.47, latitude: 51.92 },
    ]);
  });
  mockSearchResidences.mockResolvedValue([makeListing()]);
});

describe('suggestAll', () => {
  it('merges all requested sources into one list (homes, then buurten, then places)', async () => {
    const list = await suggestAll('weena', ['homes', 'buurten', 'places']);
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ kind: 'residence', label: 'Weena 5, Rotterdam' });
    expect(list[1]).toMatchObject({ kind: 'buurt', id: 'b1' });
    expect(list[2]).toMatchObject({ kind: 'place', id: 'p1' });
  });

  it('excludes buurt/wijk from Places only when the Buurten source is also on', async () => {
    await suggestAll('x', ['homes', 'buurten', 'places']);
    const placeFilters = mockSuggest.mock.calls.map((c) => c[2] as string | undefined);
    // One call scoped to buurt/wijk, one scoped to places-without-neighborhoods.
    expect(placeFilters.some((f) => f?.includes('buurt') && f.includes('wijk'))).toBe(true);
    expect(placeFilters.some((f) => f?.includes('woonplaats') && !f.includes('buurt'))).toBe(true);
  });

  it('leaves Places unfiltered when it is the only source (explore tab)', async () => {
    mockSuggest.mockResolvedValue([
      { id: 'p1', label: 'Rotterdam', type: 'woonplaats', longitude: 4.47, latitude: 51.92 },
    ]);
    const list = await suggestAll('rot', ['places']);
    expect(mockSuggest).toHaveBeenCalledTimes(1);
    expect(mockSuggest.mock.calls[0][2]).toBeUndefined(); // no type filter
    expect(mockSearchResidences).not.toHaveBeenCalled();
    expect(list.every((s) => s.kind === 'place')).toBe(true);
  });

  it('fails a source independently — one rejection does not sink the others', async () => {
    mockSearchResidences.mockRejectedValue(new Error('backend down'));
    const list = await suggestAll('x', ['homes', 'buurten', 'places']);
    expect(list.some((s) => s.kind === 'residence')).toBe(false);
    expect(list.filter((s) => s.kind === 'buurt')).toHaveLength(1);
    expect(list.filter((s) => s.kind === 'place')).toHaveLength(1);
  });

  it('orders by distance when the query matches no labels (text relevance uniform)', async () => {
    // Query "zzz" matches none of the labels, so the text half is a wash and the
    // distance half decides: home far east, buurt at the origin, place between.
    mockSearchResidences.mockResolvedValue([
      makeListing({ id: 'far', location: { longitude: 6.9, latitude: 52.2 } }),
    ]);
    mockSuggest.mockImplementation((_q: string, _signal?: AbortSignal, fq?: string) =>
      fq?.includes('buurt')
        ? Promise.resolve([{ id: 'near', label: 'Near', type: 'buurt', longitude: 4.9, latitude: 52.37 }])
        : Promise.resolve([{ id: 'mid', label: 'Mid', type: 'woonplaats', longitude: 5.1, latitude: 52.09 }]),
    );
    const list = await suggestAll('zzz', ['homes', 'buurten', 'places'], undefined, {
      longitude: 4.9,
      latitude: 52.37,
    });
    expect(list.map((s) => s.id)).toEqual(['near', 'mid', 'far']);
  });

  it('sinks a coordinate-less suggestion to the end', async () => {
    mockSearchResidences.mockResolvedValue([]);
    mockSuggest.mockImplementation((_q: string, _signal?: AbortSignal, fq?: string) =>
      fq?.includes('buurt')
        ? Promise.resolve([{ id: 'nocoord', label: 'No coord', type: 'buurt', longitude: null, latitude: null }])
        : Promise.resolve([{ id: 'hascoord', label: 'Has coord', type: 'woonplaats', longitude: 4.95, latitude: 52.35 }]),
    );
    const list = await suggestAll('x', ['buurten', 'places'], undefined, { longitude: 4.9, latitude: 52.37 });
    expect(list.map((s) => s.id)).toEqual(['hascoord', 'nocoord']);
  });

  it('ranks by text-match quality among equidistant results (exact > prefix > word > substring)', async () => {
    // All four share one coordinate, so the distance half ties and the text half
    // orders them: exact, whole-string prefix, word-boundary prefix, no match.
    mockSearchResidences.mockResolvedValue([]);
    const at = { longitude: 4.9, latitude: 52.37 };
    mockSuggest.mockImplementation((_q: string, _signal?: AbortSignal, fq?: string) =>
      fq?.includes('buurt')
        ? Promise.resolve([])
        : Promise.resolve([
            { id: 'none', label: 'Zaanstad', type: 'weg', ...at },
            { id: 'word', label: 'Oude Delft', type: 'weg', ...at },
            { id: 'exact', label: 'Delft', type: 'weg', ...at },
            { id: 'prefix', label: 'Delftweg', type: 'weg', ...at },
          ]),
    );
    const list = await suggestAll('delft', ['places'], undefined, at);
    expect(list.map((s) => s.id)).toEqual(['exact', 'prefix', 'word', 'none']);
  });

  it('breaks text-match ties by distance (nearer first)', async () => {
    // Two equally-good prefix matches of the same length; distance decides.
    mockSearchResidences.mockResolvedValue([]);
    mockSuggest.mockImplementation((_q: string, _signal?: AbortSignal, fq?: string) =>
      fq?.includes('buurt')
        ? Promise.resolve([])
        : Promise.resolve([
            { id: 'far', label: 'Delft-A', type: 'weg', longitude: 6.9, latitude: 52.2 },
            { id: 'near', label: 'Delft-B', type: 'weg', longitude: 4.9, latitude: 52.37 },
          ]),
    );
    const list = await suggestAll('delft', ['places'], undefined, { longitude: 4.9, latitude: 52.37 });
    expect(list.map((s) => s.id)).toEqual(['near', 'far']);
  });

  it('collapses a gemeente and its woonplaats into one row, keeping the gemeente', async () => {
    mockSearchResidences.mockResolvedValue([]);
    mockSuggest.mockImplementation((_q: string, _signal?: AbortSignal, fq?: string) =>
      fq?.includes('buurt')
        ? Promise.resolve([])
        : Promise.resolve([
            // gemeente label already has "Gemeente" stripped by pdok.suggest.
            { id: 'gem', label: 'Delft', type: 'gemeente', longitude: 4.36, latitude: 51.99 },
            { id: 'wpl', label: 'Delft, Delft, Zuid-Holland', type: 'woonplaats', longitude: 4.36, latitude: 51.99 },
            { id: 'weg', label: 'Delft, Delft', type: 'weg', longitude: 4.37, latitude: 51.99 },
          ]),
    );
    const ids = (await suggestAll('delft', ['places'])).map((s) => s.id);
    expect(ids).toContain('gem'); // the gemeente is kept…
    expect(ids).not.toContain('wpl'); // …its duplicate woonplaats is dropped…
    expect(ids).toContain('weg'); // …but a street sharing the name is not.
  });

  it('keeps distinct same-named places that PDOK disambiguates (Bergen NH vs L)', async () => {
    mockSearchResidences.mockResolvedValue([]);
    mockSuggest.mockImplementation((_q: string, _signal?: AbortSignal, fq?: string) =>
      fq?.includes('buurt')
        ? Promise.resolve([])
        : Promise.resolve([
            { id: 'nh', label: 'Bergen (NH)', type: 'gemeente', longitude: 4.66, latitude: 52.66 },
            { id: 'l', label: 'Bergen (L)', type: 'gemeente', longitude: 6.09, latitude: 51.59 },
          ]),
    );
    const ids = (await suggestAll('bergen', ['places'])).map((s) => s.id).sort();
    expect(ids).toEqual(['l', 'nh']);
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
    const result = await resolvePick({
      kind: 'place',
      id: 'p1',
      label: 'Rotterdam',
      type: 'woonplaats',
      longitude: 4.47,
      latitude: 51.92,
    });
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
    const result = await resolvePick({
      kind: 'buurt',
      id: 'b1',
      label: 'Grachtengordel',
      type: 'buurt',
      longitude: 4.89,
      latitude: 52.37,
    });
    expect(mockLookupBuurt).toHaveBeenCalledWith('b1', undefined);
    expect(result).toMatchObject({ kind: 'buurt', gemeentecode: '0363', buurtcode: 'BU03630000' });
  });

  it('returns null when a place lookup finds nothing', async () => {
    mockLookup.mockResolvedValue(null);
    expect(
      await resolvePick({ kind: 'place', id: 'x', label: 'x', type: 'weg', longitude: null, latitude: null }),
    ).toBeNull();
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

describe('splitSuggestionLabel', () => {
  const place = (label: string, type = 'weg'): SearchSuggestion => ({
    kind: 'place',
    id: 'x',
    label,
    type,
    longitude: null,
    latitude: null,
  });
  const buurt = (label: string): SearchSuggestion => ({
    kind: 'buurt',
    id: 'x',
    label,
    type: 'buurt',
    longitude: null,
    latitude: null,
  });

  it('splits a street address on the first comma (name left, city right)', () => {
    expect(splitSuggestionLabel(place('Kromstraat, Delft'))).toEqual({
      primary: 'Kromstraat',
      secondary: 'Delft',
    });
  });

  it('keeps the zipcode with the city on the right', () => {
    expect(splitSuggestionLabel(place("Kielawater 1, 2497ZS 's-Gravenhage", 'adres'))).toEqual({
      primary: 'Kielawater 1',
      secondary: "2497ZS 's-Gravenhage",
    });
  });

  it('splits a comma-less buurt on its trailing city word, keeping the full name', () => {
    expect(splitSuggestionLabel(buurt('Zeeheldenbuurt Delft'))).toEqual({
      primary: 'Zeeheldenbuurt',
      secondary: 'Delft',
    });
    expect(splitSuggestionLabel(buurt('Wijk 13 Hof van Delft Delft'))).toEqual({
      primary: 'Wijk 13 Hof van Delft',
      secondary: 'Delft',
    });
  });

  it('leaves a bare city (gemeente) with no secondary part', () => {
    expect(splitSuggestionLabel(place('Delft', 'gemeente'))).toEqual({
      primary: 'Delft',
      secondary: '',
    });
  });

  it('splits a home address (street left, city right)', () => {
    const home: SearchSuggestion = {
      kind: 'residence',
      id: '42',
      label: 'Weena 5, Rotterdam',
      listing: makeListing(),
    };
    expect(splitSuggestionLabel(home)).toEqual({ primary: 'Weena 5', secondary: 'Rotterdam' });
  });
});
