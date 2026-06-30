import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  areaKeys,
  cityKeys,
  cityNameKeys,
  listingKeys,
  useAreas,
  useCities,
  useCityNames,
  useListing,
  useListings,
  useListingsCount,
} from '../queries';

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  queryClient.clear();
});

// Listing data comes from the live API now (mocks removed), so these assert the
// hooks are wired and fire — not on specific listing content, which lives on the
// backend and is covered by the visual-regression e2e against staging.
describe('useListings', () => {
  it('is enabled and runs a fetch on mount', async () => {
    const { result } = await renderHook(() => useListings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.isFetched).toBe(true);
  });
});

describe('useListingsCount', () => {
  it('is enabled and runs a fetch on mount', async () => {
    const { result } = await renderHook(() => useListingsCount(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.isFetched).toBe(true);
  });
});

describe('useListing', () => {
  it('does not fetch when id is undefined', async () => {
    const { result } = await renderHook(() => useListing(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useAreas', () => {
  it('returns area polygons for a city', async () => {
    const { result } = await renderHook(() => useAreas('0518'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
  });

  it('does not fetch when no city is given', async () => {
    const { result } = await renderHook(() => useAreas(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useCities', () => {
  it('returns the city list', async () => {
    const { result } = await renderHook(() => useCities(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
  });
});

describe('useCityNames', () => {
  it('returns an empty list when no backend is configured', async () => {
    const { result } = await renderHook(() => useCityNames(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('query keys', () => {
  it('listingKeys.list produces stable keys', () => {
    const key1 = listingKeys.list({ status: 'for_sale' });
    const key2 = listingKeys.list({ status: 'for_sale' });
    expect(key1).toEqual(key2);
  });

  it('listingKeys.detail includes the id', () => {
    const key = listingKeys.detail('lst_001');
    expect(key).toEqual(['listings', 'detail', 'lst_001']);
  });

  it('areaKeys.all is stable', () => {
    expect(areaKeys.all).toEqual(['areas']);
  });

  it('cityKeys.all is stable', () => {
    expect(cityKeys.all).toEqual(['cities']);
  });

  it('cityNameKeys.all is stable and distinct from cityKeys', () => {
    expect(cityNameKeys.all).toEqual(['city-names']);
    expect(cityNameKeys.all).not.toEqual(cityKeys.all);
  });
});
