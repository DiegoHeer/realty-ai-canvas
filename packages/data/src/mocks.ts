import type { Listing } from '@realty/types';

import type { CityName } from './client';

/**
 * Bundled sample listings (around Amsterdam) used until the real API is wired
 * up. Coordinates are roughly correct so the map looks sensible in dev.
 * Images are from Unsplash's free source endpoint.
 */
export const mockListings: Listing[] = [
  {
    id: 'lst_001',
    title: 'Bright canal-side apartment',
    description:
      'A light-filled two-bedroom apartment overlooking the Prinsengracht, recently renovated with an open-plan kitchen.',
    price: 675000,
    currency: 'EUR',
    status: 'for_sale',
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 84,
    roomCount: 3,
    constructionPeriod: '1910',
    energyLabel: 'B',
    buildingType: 'apartment',
    foundationRisk: { label: 'Kwetsbaar gebied - 60-80 %', soilType: 'Zeekleigebied', pre1970Pct: 75 },
    address: { line1: 'Prinsengracht 412', city: 'Amsterdam', postalCode: '1016 JA', country: 'NL' },
    location: { latitude: 52.3676, longitude: 4.884 },
    images: [{ id: 'img_001', url: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800' }],
    createdAt: '2026-05-02T09:00:00.000Z',
    sources: [
      { url: 'https://funda.nl/koop/amsterdam/lst_001', name: 'Funda' },
      { url: 'https://pararius.nl/koop/amsterdam/lst_001', name: 'Pararius' },
    ],
  },
  {
    id: 'lst_002',
    title: 'Modern loft near Vondelpark',
    description: 'Spacious loft with high ceilings, a rooftop terrace and parking, steps from the park.',
    price: 1250000,
    currency: 'EUR',
    status: 'for_sale',
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 142,
    roomCount: 4,
    constructionPeriod: '2018',
    energyLabel: 'A',
    buildingType: 'apartment',
    address: { line1: 'Vondelstraat 78', city: 'Amsterdam', postalCode: '1054 GK', country: 'NL' },
    location: { latitude: 52.3584, longitude: 4.8686 },
    images: [{ id: 'img_002', url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800' }],
    createdAt: '2026-05-10T12:30:00.000Z',
    sources: [{ url: 'https://vastgoed.nl/koop/amsterdam/lst_002', name: 'Vastgoed NL' }],
  },
  {
    id: 'lst_003',
    title: 'Cosy studio in De Pijp',
    description: 'Efficient studio in the heart of the lively De Pijp neighbourhood. Ideal first home or rental.',
    price: 1450,
    currency: 'EUR',
    status: 'for_rent',
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 38,
    buildingType: 'apartment',
    foundationRisk: { label: 'Stedelijk gebied - 80-100 %', soilType: 'Niet indeelbaar', pre1970Pct: 90 },
    address: { line1: 'Albert Cuypstraat 120', city: 'Amsterdam', postalCode: '1072 EA', country: 'NL' },
    location: { latitude: 52.3552, longitude: 4.8924 },
    images: [{ id: 'img_003', url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800' }],
    createdAt: '2026-05-18T08:15:00.000Z',
  },
  {
    id: 'lst_004',
    title: 'Family townhouse in Jordaan',
    description: 'Characterful four-bedroom townhouse with a garden, on a quiet street in the Jordaan.',
    price: 1875000,
    currency: 'EUR',
    status: 'pending',
    bedrooms: 4,
    bathrooms: 2,
    areaSqm: 196,
    buildingType: 'terraced',
    foundationRisk: { label: 'Kwetsbaar gebied - 80-100 %', soilType: 'Laagveengebied', pre1970Pct: 95 },
    address: { line1: 'Egelantiersgracht 22', city: 'Amsterdam', postalCode: '1015 RL', country: 'NL' },
    location: { latitude: 52.3766, longitude: 4.8826 },
    images: [{ id: 'img_004', url: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800' }],
    createdAt: '2026-04-28T15:45:00.000Z',
  },
  {
    id: 'lst_005',
    title: 'Waterfront penthouse, IJburg',
    description: 'Contemporary penthouse with panoramic water views, two balconies and a private mooring.',
    price: 2150000,
    currency: 'EUR',
    status: 'for_sale',
    bedrooms: 3,
    bathrooms: 3,
    areaSqm: 168,
    buildingType: 'apartment',
    foundationRisk: { label: 'Niet kwetsbaar gebied - 0-20 %', soilType: 'Hogere Zandgronden', pre1970Pct: 0 },
    address: { line1: 'Krijn Taconiskade 410', city: 'Amsterdam', postalCode: '1087 HW', country: 'NL' },
    location: { latitude: 52.3531, longitude: 4.9923 },
    images: [{ id: 'img_005', url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800' }],
    createdAt: '2026-05-22T10:05:00.000Z',
  },
  {
    id: 'lst_006',
    title: 'Renovated flat near Oosterpark',
    description: 'Turn-key two-bedroom flat with a south-facing balcony, close to Oosterpark and transit.',
    price: 545000,
    currency: 'EUR',
    status: 'sold',
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 72,
    buildingType: 'apartment',
    address: { line1: "'s-Gravesandestraat 51", city: 'Amsterdam', postalCode: '1092 AA', country: 'NL' },
    location: { latitude: 52.3597, longitude: 4.9203 },
    images: [{ id: 'img_006', url: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800' }],
    createdAt: '2026-03-30T11:20:00.000Z',
  },
];

/**
 * Sample municipality names used by the onboarding city picker when no backend
 * is configured (mock/offline builds and the deterministic web export the visual
 * tests screenshot). Codes are real CBS municipality codes so they line up with
 * the live `/v1/cities` data; the live endpoint returns all ~342 municipalities,
 * of which these are a representative subset (the largest cities plus a few more
 * so fuzzy search has something to match). Den Haag is listed under its formal
 * name '`s-Gravenhage`', exactly as the API returns it.
 */
export const mockCityNames: CityName[] = [
  { code: '0518', name: "'s-Gravenhage" },
  { code: '0796', name: "'s-Hertogenbosch" },
  { code: '0361', name: 'Alkmaar' },
  { code: '0034', name: 'Almere' },
  { code: '0307', name: 'Amersfoort' },
  { code: '0362', name: 'Amstelveen' },
  { code: '0363', name: 'Amsterdam' },
  { code: '0200', name: 'Apeldoorn' },
  { code: '0202', name: 'Arnhem' },
  { code: '0758', name: 'Breda' },
  { code: '0772', name: 'Eindhoven' },
  { code: '0153', name: 'Enschede' },
  { code: '0014', name: 'Groningen' },
  { code: '0392', name: 'Haarlem' },
  { code: '0268', name: 'Nijmegen' },
  { code: '0599', name: 'Rotterdam' },
  { code: '0855', name: 'Tilburg' },
  { code: '0344', name: 'Utrecht' },
];
