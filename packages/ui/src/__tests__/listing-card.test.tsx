import { initI18n } from '@realty/i18n';
import type { Listing } from '@realty/types';
import { fireEvent, render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { ListingCard } from '../listing-card';

const mockListing: Listing = {
  id: 'lst_test',
  title: 'Test Apartment',
  price: 450000,
  currency: 'EUR',
  status: 'for_sale',
  bedrooms: 2,
  bathrooms: 1,
  areaSqm: 75,
  address: { line1: 'Teststraat 10', city: 'Amsterdam', postalCode: '1000 AA', country: 'NL' },
  location: { latitude: 52.37, longitude: 4.89 },
  images: [{ id: 'img_1', url: 'https://example.com/photo.jpg', alt: 'Test' }],
  createdAt: '2026-01-01T00:00:00Z',
};

const mockListingNoImages: Listing = {
  ...mockListing,
  id: 'lst_no_img',
  images: [],
};

async function renderWithI18n(ui: React.ReactElement, language = 'en') {
  const i18n = initI18n(language);
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('ListingCard', () => {
  it('renders price', async () => {
    const { getByText } = await renderWithI18n(<ListingCard listing={mockListing} />);
    expect(getByText(/€/)).toBeTruthy();
    expect(getByText(/450/)).toBeTruthy();
  });

  it('renders title', async () => {
    const { getByText } = await renderWithI18n(<ListingCard listing={mockListing} />);
    expect(getByText('Test Apartment')).toBeTruthy();
  });

  it('renders address', async () => {
    const { getByText } = await renderWithI18n(<ListingCard listing={mockListing} />);
    expect(getByText(/Teststraat 10, Amsterdam/)).toBeTruthy();
  });

  it('renders status badge in English', async () => {
    const { getByText } = await renderWithI18n(<ListingCard listing={mockListing} />, 'en');
    expect(getByText('For sale')).toBeTruthy();
  });

  it('renders bed/bath/area stats', async () => {
    const { getByText } = await renderWithI18n(<ListingCard listing={mockListing} />);
    expect(getByText(/2 bd/)).toBeTruthy();
    expect(getByText(/1 ba/)).toBeTruthy();
    expect(getByText(/75 m²/)).toBeTruthy();
  });

  it('renders placeholder when listing has no images', async () => {
    const { toJSON } = await renderWithI18n(<ListingCard listing={mockListingNoImages} />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('fires onPress callback when pressed', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderWithI18n(<ListingCard listing={mockListing} onPress={onPress} />);
    const card = getByText('Test Apartment');
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders in Dutch when language is nl', async () => {
    const { getByText } = await renderWithI18n(<ListingCard listing={mockListing} />, 'nl');
    expect(getByText('Te koop')).toBeTruthy();
    expect(getByText(/slpk/)).toBeTruthy();
    expect(getByText(/badk/)).toBeTruthy();
  });
});
