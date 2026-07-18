import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';

import { createPersistedListStore } from '@/lib/persisted-list-store';

/**
 * `createPersistedListStore` is a factory — each call gets its own in-memory
 * state, so a fresh store per test (with a dedicated key) is enough isolation;
 * no module registry reset needed (which would double-load `react` and break
 * `renderHook`, per the store's `useSyncExternalStore` hook — see
 * preferred-cities.test.ts for why other stores avoid renderHook after reset).
 */
interface Row {
  kind?: string;
  id: string;
}

describe('persisted list store — isValid', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('drops hydrated entries that fail the isValid guard, keeping the rest', async () => {
    const key = 'test:isValid-drops';
    await AsyncStorage.setItem(
      key,
      JSON.stringify([{ id: 'legacy' }, { kind: 'ok', id: 'good' }] satisfies Row[]),
    );
    const store = createPersistedListStore<Row>({
      key,
      limit: 8,
      idOf: (item) => item.id,
      isValid: (item) => item.kind === 'ok',
    });

    const { result } = await renderHook(() => store.use());

    await waitFor(() => expect(result.current).toEqual([{ kind: 'ok', id: 'good' }]));
  });

  it('keeps every hydrated entry when isValid is omitted', async () => {
    const key = 'test:isValid-omitted';
    await AsyncStorage.setItem(key, JSON.stringify([{ id: 'a' }, { id: 'b' }] satisfies Row[]));
    const store = createPersistedListStore<Row>({ key, limit: 8, idOf: (item) => item.id });

    const { result } = await renderHook(() => store.use());

    await waitFor(() => expect(result.current).toEqual([{ id: 'a' }, { id: 'b' }]));
  });
});
