import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  completeOnboarding,
  resetOnboarding,
  setOnboardingPage,
  useOnboarding,
} from '@/lib/onboarding';
import { StorageKeys } from '@/lib/storage';

async function storedOnboarding() {
  const raw = await AsyncStorage.getItem(StorageKeys.onboarding);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  // Hydration already ran once on import; reset to a known clean state.
  resetOnboarding();
});

describe('onboarding store', () => {
  it('starts pending at page 0', async () => {
    const { result } = await renderHook(() => useOnboarding());
    expect(result.current.status).toBe('pending');
    expect(result.current.lastPage).toBe(0);
  });

  it('records the furthest page reached and never moves backward', async () => {
    const { result } = await renderHook(() => useOnboarding());

    await act(async () => setOnboardingPage(2));
    expect(result.current.lastPage).toBe(2);

    await act(async () => setOnboardingPage(1));
    expect(result.current.lastPage).toBe(2);

    await waitFor(async () => expect((await storedOnboarding())?.lastPage).toBe(2));
  });

  it('marks the tour done on complete and persists it', async () => {
    const { result } = await renderHook(() => useOnboarding());

    await act(async () => completeOnboarding());

    expect(result.current.status).toBe('done');
    await waitFor(async () => expect((await storedOnboarding())?.status).toBe('done'));
  });

  it('re-arms the tour on reset', async () => {
    const { result } = await renderHook(() => useOnboarding());

    await act(async () => {
      setOnboardingPage(3);
      completeOnboarding();
    });
    expect(result.current.status).toBe('done');

    await act(async () => resetOnboarding());

    expect(result.current.status).toBe('pending');
    expect(result.current.lastPage).toBe(0);
    await waitFor(async () =>
      expect(await storedOnboarding()).toEqual({ status: 'pending', lastPage: 0 }),
    );
  });
});
