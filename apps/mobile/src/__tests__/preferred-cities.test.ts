import { waitFor } from '@testing-library/react-native';

import type { PreferredCity } from '@/lib/preferred-cities';

/**
 * The store hydrates — and queues the launch map focus — as an import side
 * effect, so each case boots a fresh module registry: mock map-focus, seed
 * AsyncStorage, then load the module and await its hydration. Loaded with
 * `require` (typed via cast) — Jest's VM can't run native dynamic import.
 */
async function boot(stored?: unknown) {
  jest.resetModules();
  const setMapFocus = jest.fn();
  jest.doMock('@/lib/map-focus', () => ({ setMapFocus }));
  /* eslint-disable @typescript-eslint/no-require-imports */
  // The test-setup mock is plain CJS (no `default`), unlike the real module.
  const AsyncStorage = require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage').default;
  const { StorageKeys } = require('@/lib/storage') as typeof import('@/lib/storage');
  await AsyncStorage.clear();
  if (stored !== undefined) {
    await AsyncStorage.setItem(StorageKeys.preferredCities, JSON.stringify(stored));
  }
  const mod = require('@/lib/preferred-cities') as typeof import('@/lib/preferred-cities');
  /* eslint-enable @typescript-eslint/no-require-imports */
  await mod.hydratePreferredCities();
  return { mod, setMapFocus, AsyncStorage, StorageKeys };
}

const GRONINGEN: PreferredCity = { code: '0014', name: 'Groningen' };
const AMSTERDAM: PreferredCity = { code: '0363', name: 'Amsterdam' };

describe('preferred cities store', () => {
  it('hydrates the saved list and queues the map focus on the first city', async () => {
    const { mod, setMapFocus } = await boot([GRONINGEN, AMSTERDAM]);

    expect(mod.getPreferredCities()).toEqual([GRONINGEN, AMSTERDAM]);
    expect(setMapFocus).toHaveBeenCalledTimes(1);
    expect(setMapFocus).toHaveBeenCalledWith(GRONINGEN);
  });

  it('stays empty and queues no focus when nothing is saved', async () => {
    const { mod, setMapFocus } = await boot();

    expect(mod.getPreferredCities()).toEqual([]);
    expect(setMapFocus).not.toHaveBeenCalled();
  });

  it('drops malformed entries instead of crashing on them', async () => {
    const { mod, setMapFocus } = await boot([{ code: 14 }, 'junk', AMSTERDAM]);

    expect(mod.getPreferredCities()).toEqual([AMSTERDAM]);
    expect(setMapFocus).toHaveBeenCalledWith(AMSTERDAM);
  });

  it('treats a non-array record as no preference', async () => {
    const { mod, setMapFocus } = await boot({ city: 'Groningen' });

    expect(mod.getPreferredCities()).toEqual([]);
    expect(setMapFocus).not.toHaveBeenCalled();
  });

  it('persists a new preference under the realty namespace', async () => {
    const { mod, AsyncStorage, StorageKeys } = await boot();

    mod.setPreferredCities([GRONINGEN]);

    expect(mod.getPreferredCities()).toEqual([GRONINGEN]);
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem(StorageKeys.preferredCities))!)).toEqual([
        GRONINGEN,
      ]),
    );
  });

  it('hydrates only once per boot', async () => {
    const { mod, setMapFocus } = await boot([GRONINGEN]);

    await mod.hydratePreferredCities();

    expect(setMapFocus).toHaveBeenCalledTimes(1);
  });
});
