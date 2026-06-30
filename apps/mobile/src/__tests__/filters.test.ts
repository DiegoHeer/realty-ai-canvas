import { DEFAULT_FILTERS, filtersToQuery, type Filters } from '@/lib/filters';

describe('filtersToQuery', () => {
  it('maps the unfiltered defaults to deal_type sale + newest with no constraints', () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toEqual({
      dealType: 'sale',
      minPrice: undefined,
      maxPrice: undefined,
      buildingTypes: undefined,
      minBedrooms: undefined,
      minBathrooms: undefined,
      minAreaSqm: undefined,
      maxAreaSqm: undefined,
      energyLabels: undefined,
      minBuildYear: undefined,
      sort: 'newest',
    });
  });

  it('maps rent mode to deal_type rent', () => {
    expect(filtersToQuery({ ...DEFAULT_FILTERS, mode: 'rent' }).dealType).toBe('rent');
  });

  it('forwards set facets and drops "any" (null/empty/0) ones', () => {
    const filters: Filters = {
      ...DEFAULT_FILTERS,
      minPrice: 300000,
      maxPrice: null,
      propertyTypes: ['apartment', 'terraced'],
      minBedrooms: 2,
      minBathrooms: 0,
      minAreaSqm: 70,
      energyLabels: ['A', 'B'],
      minBuildYear: 1990,
      sort: 'price_asc',
    };
    const q = filtersToQuery(filters);
    expect(q.minPrice).toBe(300000);
    expect(q.maxPrice).toBeUndefined();
    expect(q.buildingTypes).toEqual(['apartment', 'terraced']);
    expect(q.minBedrooms).toBe(2);
    expect(q.minBathrooms).toBeUndefined();
    expect(q.minAreaSqm).toBe(70);
    expect(q.energyLabels).toEqual(['A', 'B']);
    expect(q.minBuildYear).toBe(1990);
    expect(q.sort).toBe('price_asc');
  });
});
