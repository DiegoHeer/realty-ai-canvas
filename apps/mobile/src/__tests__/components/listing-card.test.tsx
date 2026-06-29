import { initI18n } from '@realty/i18n';
import type { Listing } from '@realty/types';
import { fireEvent, render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { ListingCard } from '@/components/listing-card';
import { clearLikes } from '@/lib/likes';

// Accessibility labels of the heart toggle (from packages/i18n en.json).
const LIKE = 'Save to favorites';
const UNLIKE = 'Remove from favorites';

function makeListing(id: string, title: string): Listing {
  return {
    id,
    title,
    price: 500000,
    currency: 'EUR',
    status: 'for_sale',
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 84,
    address: { line1: 'Teststraat 1', city: 'Amsterdam', postalCode: '1011 AB', country: 'NL' },
    location: { latitude: 52.37, longitude: 4.89 },
    images: [{ id: `${id}_img`, url: 'https://example.test/cover.jpg' }],
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

const i18n = initI18n('en');

function renderCard(listing: Listing) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ListingCard listing={listing} />
    </I18nextProvider>,
  );
}

// The likes store is a module singleton; reset it so each test starts clean.
beforeEach(() => {
  clearLikes();
});

describe('ListingCard like button', () => {
  it('starts unliked and toggles when pressed', () => {
    const { getByLabelText } = renderCard(makeListing('lst_a', 'Apartment A'));

    expect(getByLabelText(LIKE)).toBeTruthy();
    fireEvent.press(getByLabelText(LIKE));
    expect(getByLabelText(UNLIKE)).toBeTruthy();
  });

  // The card stays mounted while the user browses markers — only the `listing`
  // prop changes. The heart must track the listing under it, not carry over.
  it('reflects each listing as the user browses between them', () => {
    const a = makeListing('lst_a', 'Apartment A');
    const b = makeListing('lst_b', 'House B');

    const { getByLabelText, rerender } = renderCard(a);

    // Like A.
    fireEvent.press(getByLabelText(LIKE));
    expect(getByLabelText(UNLIKE)).toBeTruthy();

    // Browse to B — it was never liked, so the heart resets to empty.
    rerender(
      <I18nextProvider i18n={i18n}>
        <ListingCard listing={b} />
      </I18nextProvider>,
    );
    expect(getByLabelText(LIKE)).toBeTruthy();

    // Browse back to A — still liked (the store remembers it).
    rerender(
      <I18nextProvider i18n={i18n}>
        <ListingCard listing={a} />
      </I18nextProvider>,
    );
    expect(getByLabelText(UNLIKE)).toBeTruthy();
  });
});
