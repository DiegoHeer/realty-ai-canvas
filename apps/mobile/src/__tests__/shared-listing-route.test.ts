import { isSharedListingRoute } from '@/app/[locale]/listing/[slug]/[id]';

describe('isSharedListingRoute', () => {
  it('matches the shared-listing redirect segment shape', () => {
    expect(isSharedListingRoute(['[locale]', 'listing', '[slug]', '[id]'])).toBe(true);
    expect(isSharedListingRoute(['nl', 'listing', 'martin-luther-kinglaan-129', '11292'])).toBe(true);
  });

  it('does not match other routes', () => {
    expect(isSharedListingRoute(['listing', '[id]'])).toBe(false);
    expect(isSharedListingRoute(['settings', 'language'])).toBe(false);
    expect(isSharedListingRoute(['(tabs)'])).toBe(false);
    expect(isSharedListingRoute([])).toBe(false);
  });
});
