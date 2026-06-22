import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  areaKeys,
  cityKeys,
  listingKeys,
  useAreas,
  useCities,
  useListing,
  useListings,
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

describe('useListings', () => {
  it('returns mock listings', async () => {
    const { result } = await renderHook(() => useListings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.length).toBeGreaterThan(0);
  });

  it('filters by status', async () => {
    const { result } = await renderHook(() => useListings({ status: 'for_sale' }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.every((l) => l.status === 'for_sale')).toBe(true);
  });
});

describe('useListing', () => {
  it('returns a single listing by id', async () => {
    const { result } = await renderHook(() => useListing('lst_001'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.id).toBe('lst_001');
  });

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
});
