import AsyncStorage from '@react-native-async-storage/async-storage';
import { cityNameKeys, DataProvider, queryClient } from '@realty/data';
import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import { Dimensions } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import OnboardingScreen from '@/app/onboarding';
import { signOut } from '@/hooks/use-auth';
import { resetFilters, useFilters } from '@/lib/filters';
import { clearMapFocus, useMapFocus } from '@/lib/map-focus';
import { resetOnboarding, useOnboarding } from '@/lib/onboarding';
import { getPreferredCities, setPreferredCities } from '@/lib/preferred-cities';

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  await i18n.changeLanguage(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <DataProvider>
        <OnboardingScreen />
      </DataProvider>
    </I18nextProvider>,
  );
}

// One interaction per act() scope so each re-render settles before the next
// press reads updated state (mirrors the auth screen tests).
async function tap(element: ReactTestInstance) {
  await act(async () => {
    fireEvent.press(element);
  });
}

// There is no Continue button — pages advance by tapping the left/right third
// of the current page. Taps are throttled on Date.now, so the mocked clock
// steps past the throttle window before every tap.
let clock = 0;
let nowSpy: ReturnType<typeof jest.spyOn> | undefined;

async function tapPage(
  getByTestId: (id: string) => ReactTestInstance,
  cell: number,
  fraction: number,
) {
  clock += 1000;
  await act(async () => {
    fireEvent.press(getByTestId(`onboarding-page-${cell}`), {
      nativeEvent: { pageX: Dimensions.get('window').width * fraction },
    });
  });
}

/** Advance from the first page to the last (4 right-edge taps). */
async function advanceToLastPage(getByTestId: (id: string) => ReactTestInstance) {
  for (let i = 0; i < 4; i++) {
    await tapPage(getByTestId, i, 0.8);
  }
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetOnboarding();
  resetFilters();
  signOut();
  clearMapFocus();
  setPreferredCities([]);
  clock = 1_000_000;
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock) as ReturnType<typeof jest.spyOn>;
});

afterEach(() => {
  nowSpy?.mockRestore();
});

afterEach(() => {
  queryClient.clear();
});

describe('OnboardingScreen', () => {
  it('opens on the welcome page with skip and no back button or Continue', async () => {
    const { getByText, getByTestId, queryByTestId } = await renderScreen('en');

    expect(getByText('Welcome to Huismus')).toBeTruthy();
    expect(getByTestId('skip-tour')).toBeTruthy();
    // Navigation is swipe/tap-only — there is no per-page Continue button.
    expect(queryByTestId('onboarding-next')).toBeNull();
    // The first page has nothing to go back to.
    expect(queryByTestId('onboarding-back')).toBeNull();
  });

  it('advances through the pages; the last one carries the finishing action', async () => {
    const { getByText, getByTestId, getByLabelText } = await renderScreen('en');

    await tapPage(getByTestId, 0, 0.8);
    // Back appears once we've left the first page.
    expect(getByTestId('onboarding-back')).toBeTruthy();

    await tapPage(getByTestId, 1, 0.8);
    await tapPage(getByTestId, 2, 0.8);
    await tapPage(getByTestId, 3, 0.8);

    // Final page: the single finishing action (no account yet → the
    // account-less variant).
    expect(getByLabelText('Step 5 of 5')).toBeTruthy();
    expect(getByText('Get started without account')).toBeTruthy();
  });

  it('flips one page per tap on the left/right page edges, ignoring the middle', async () => {
    const { getByTestId, getByLabelText, queryByTestId } = await renderScreen('en');

    // A tap on the right third advances one page.
    await tapPage(getByTestId, 0, 0.8);
    expect(getByTestId('onboarding-back')).toBeTruthy();
    expect(getByLabelText('Step 2 of 5')).toBeTruthy();

    // A second tap inside the throttle window is swallowed (no page skip).
    clock -= 900; // tapPage adds 1000 → net +100ms since the last tap
    await tapPage(getByTestId, 1, 0.8);
    expect(getByLabelText('Step 2 of 5')).toBeTruthy();

    // The middle third is a dead zone (reserved for page content).
    await tapPage(getByTestId, 1, 0.5);
    expect(getByLabelText('Step 2 of 5')).toBeTruthy();

    // A tap on the left third goes back.
    await tapPage(getByTestId, 1, 0.2);
    expect(queryByTestId('onboarding-back')).toBeNull();
    expect(getByLabelText('Step 1 of 5')).toBeTruthy();
  });

  it('goes back to the previous page with the Back button', async () => {
    const { getByTestId, queryByTestId } = await renderScreen('en');

    await tapPage(getByTestId, 0, 0.8);
    expect(getByTestId('onboarding-back')).toBeTruthy();

    await tap(getByTestId('onboarding-back'));
    expect(queryByTestId('onboarding-back')).toBeNull();
  });

  it('skips the whole tour, marking it done and returning to the app', async () => {
    const { getByTestId } = await renderScreen('en');

    await tap(getByTestId('skip-tour'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    const { result } = await renderHook(() => useOnboarding());
    expect(result.current.status).toBe('done');
  });

  it('opens the existing auth screens from the account step', async () => {
    const { getByTestId } = await renderScreen('en');

    await advanceToLastPage(getByTestId); // → account step

    await tap(getByTestId('onboarding-create-account'));
    expect(router.push).toHaveBeenCalledWith('/auth/register');

    await tap(getByTestId('onboarding-log-in'));
    expect(router.push).toHaveBeenCalledWith('/auth/login');
  });

  it('finishing saves the preferred cities, focuses the map and marks the tour done', async () => {
    // The city list is fetched from the API (mocks were removed); seed the query
    // cache so the picker has a deterministic set to search. useCityNames pins
    // staleTime: Infinity, so this seeded data is used without a network fetch.
    queryClient.setQueryData(cityNameKeys.all, [
      { code: '0363', name: 'Amsterdam' },
      { code: '0518', name: "'s-Gravenhage" },
      { code: '0599', name: 'Rotterdam' },
    ]);
    const { getByTestId } = await renderScreen('en');

    // Walk to the cities step (welcome → features → filters → cities).
    await tapPage(getByTestId, 0, 0.8);
    await tapPage(getByTestId, 1, 0.8);
    await tapPage(getByTestId, 2, 0.8);

    // Search the full list and select Amsterdam (0363), then Rotterdam (0599).
    for (const [query, code] of [
      ['amsterdam', '0363'],
      ['rotterdam', '0599'],
    ]) {
      await act(async () => {
        fireEvent.changeText(getByTestId('city-search-input'), query);
      });
      await waitFor(() => expect(getByTestId(`city-result-${code}`)).toBeTruthy());
      await tap(getByTestId(`city-result-${code}`));
    }

    // On to the account step, then finish without an account.
    await tapPage(getByTestId, 3, 0.8);
    await tap(getByTestId('onboarding-get-started'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));

    const onboarding = await renderHook(() => useOnboarding());
    expect(onboarding.result.current.status).toBe('done');
    // The full selection is saved, in pick order, as the preferred cities.
    expect(getPreferredCities()).toEqual([
      { code: '0363', name: 'Amsterdam' },
      { code: '0599', name: 'Rotterdam' },
    ]);
    // The first selected city is handed to the map to focus on.
    const focus = await renderHook(() => useMapFocus());
    expect(focus.result.current?.code).toBe('0363');
    // Buy/rent stays at the default "buy" and is committed to the live filters.
    const filters = await renderHook(() => useFilters());
    expect(filters.result.current.filters.mode).toBe('buy');
  });

  it('replaying the tour keeps the saved preferred cities when left untouched', async () => {
    queryClient.setQueryData(cityNameKeys.all, [{ code: '0363', name: 'Amsterdam' }]);
    setPreferredCities([{ code: '0363', name: 'Amsterdam' }]);
    const { getByTestId } = await renderScreen('en');

    // Straight through to the last page and finish, never touching the cities
    // step — the seeded selection must survive, not be wiped by the finish.
    await advanceToLastPage(getByTestId);
    await tap(getByTestId('onboarding-get-started'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(getPreferredCities()).toEqual([{ code: '0363', name: 'Amsterdam' }]);
    const focus = await renderHook(() => useMapFocus());
    expect(focus.result.current?.code).toBe('0363');
  });

  it('localizes its copy (Dutch)', async () => {
    const { getByText } = await renderScreen('nl');
    expect(getByText('Tour overslaan')).toBeTruthy();
    expect(getByText('Welkom bij Huismus')).toBeTruthy();
  });
});
