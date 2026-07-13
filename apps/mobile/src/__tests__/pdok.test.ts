import { geocode, lookup, suggest } from '@/lib/pdok';

// PDOK's HTTP layer is the only dependency; stub global.fetch per test with a
// canned Solr `response.docs` payload.
const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function mockDocs(docs: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { docs } }),
  }) as unknown as typeof fetch;
}

describe('pdok "Gemeente" prefix stripping', () => {
  it('suggest shows a municipality by its bare name and still parses the centroid', async () => {
    mockDocs([
      { id: 'gem', weergavenaam: 'Gemeente Delft', type: 'gemeente', centroide_ll: 'POINT(4.363 51.998)' },
      { id: 'wpl', weergavenaam: 'Delft, Delft, Zuid-Holland', type: 'woonplaats', centroide_ll: 'POINT(4.363 51.998)' },
    ]);
    const res = await suggest('delft');
    expect(res[0]).toMatchObject({ id: 'gem', label: 'Delft', longitude: 4.363, latitude: 51.998 });
    // Non-municipality labels are left untouched.
    expect(res[1].label).toBe('Delft, Delft, Zuid-Holland');
  });

  it('lookup strips the prefix so a picked municipality resolves to its bare name', async () => {
    mockDocs([{ weergavenaam: 'Gemeente Amsterdam', type: 'gemeente', centroide_ll: 'POINT(4.9 52.37)' }]);
    expect((await lookup('gem'))?.label).toBe('Amsterdam');
  });

  it('geocode strips the prefix for a typed municipality submit', async () => {
    mockDocs([{ weergavenaam: 'Gemeente Utrecht', type: 'gemeente', centroide_ll: 'POINT(5.12 52.09)' }]);
    expect((await geocode('utrecht'))?.label).toBe('Utrecht');
  });
});

describe('pdok motorway-link (afrit) filtering', () => {
  it('drops NWB-only weg but keeps BAG streets and non-weg types', async () => {
    mockDocs([
      { id: 'city', weergavenaam: 'Gemeente Delft', type: 'gemeente', bron: 'Bestuurlijke Grenzen', centroide_ll: 'POINT(4.36 51.99)' },
      { id: 'street', weergavenaam: 'Oude Delft, Delft', type: 'weg', bron: 'BAG/NWB', centroide_ll: 'POINT(4.35 52.01)' },
      { id: 'afrit', weergavenaam: 'Delft 9, Delft', type: 'weg', bron: 'NWB', centroide_ll: 'POINT(4.37 52.01)' },
      { id: 'exit', weergavenaam: 'Delft, Delft', type: 'weg', bron: 'NWB', centroide_ll: 'POINT(4.37 51.99)' },
    ]);
    expect((await suggest('delft')).map((s) => s.id)).toEqual(['city', 'street']);
  });
});
