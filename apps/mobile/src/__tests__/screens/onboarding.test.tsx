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

/** Advance from the first page to the last (4 Continue presses). */
async function advanceToLastPage(getByTestId: (id: string) => ReactTestInstance) {
  for (let i = 0; i < 4; i++) {
    await tap(getByTestId('onboarding-next'));
  }
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetOnboarding();
  resetFilters();
  signOut();
  clearMapFocus();
});

afterEach(() => {
  queryClient.clear();
});

describe('OnboardingScreen', () => {
  it('opens on the welcome page with skip + continue and no back button', async () => {
    const { getByText, getByTestId, queryByTestId } = await renderScreen('en');

    expect(getByText('Welcome to Realty AI Canvas')).toBeTruthy();
    expect(getByTestId('skip-tour')).toBeTruthy();
    expect(getByTestId('onboarding-next')).toBeTruthy();
    // The first page has nothing to go back to.
    expect(queryByTestId('onboarding-back')).toBeNull();
  });

  it('advances through the pages and shows "Get started" on the last one', async () => {
    const { getByText, getByTestId } = await renderScreen('en');

    await tap(getByTestId('onboarding-next'));
    // Back appears once we've left the first page.
    expect(getByTestId('onboarding-back')).toBeTruthy();

    await tap(getByTestId('onboarding-next'));
    await tap(getByTestId('onboarding-next'));
    await tap(getByTestId('onboarding-next'));

    // Final page: the primary action becomes "Get started".
    expect(getByText('Get started')).toBeTruthy();
  });

  it('flips one page per tap on the left/right page edges, ignoring the middle', async () => {
    const { getByTestId, getByLabelText, queryByTestId } = await renderScreen('en');
    const width = Dimensions.get('window').width;

    // Taps are throttled so a burst can't skip pages; step the clock past the
    // throttle window between taps.
    let clock = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const tapAt = async (cell: number, fraction: number) => {
      clock += 1000;
      await act(async () => {
        fireEvent.press(getByTestId(`onboarding-page-${cell}`), {
          nativeEvent: { pageX: width * fraction },
        });
      });
    };

    try {
      // A tap on the right third advances one page.
      await tapAt(0, 0.8);
      expect(getByTestId('onboarding-back')).toBeTruthy();
      expect(getByLabelText('Step 2 of 5')).toBeTruthy();

      // A second tap inside the throttle window is swallowed (no page skip).
      clock += 100 - 1000;
      await tapAt(1, 0.8); // tapAt adds 1000 → net +100ms since the last tap
      expect(getByLabelText('Step 2 of 5')).toBeTruthy();

      // The middle third is a dead zone (reserved for page content).
      await tapAt(1, 0.5);
      expect(getByLabelText('Step 2 of 5')).toBeTruthy();

      // A tap on the left third goes back.
      await tapAt(1, 0.2);
      expect(queryByTestId('onboarding-back')).toBeNull();
      expect(getByLabelText('Step 1 of 5')).toBeTruthy();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('goes back to the previous page with the Back button', async () => {
    const { getByTestId, queryByTestId } = await renderScreen('en');

    await tap(getByTestId('onboarding-next'));
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

  it('finishing applies the chosen city to the map and marks the tour done', async () => {
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
    await tap(getByTestId('onboarding-next'));
    await tap(getByTestId('onboarding-next'));
    await tap(getByTestId('onboarding-next'));

    // Search the full list and select Amsterdam (code 0363).
    await act(async () => {
      fireEvent.changeText(getByTestId('city-search-input'), 'amsterdam');
    });
    await waitFor(() => expect(getByTestId('city-result-0363')).toBeTruthy());
    await tap(getByTestId('city-result-0363'));

    // Continue to the account step, then finish.
    await tap(getByTestId('onboarding-next'));
    await tap(getByTestId('onboarding-next')); // "Get started" → finish

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));

    const onboarding = await renderHook(() => useOnboarding());
    expect(onboarding.result.current.status).toBe('done');
    // The first selected city is handed to the map to focus on.
    const focus = await renderHook(() => useMapFocus());
    expect(focus.result.current?.code).toBe('0363');
    // Buy/rent stays at the default "buy" and is committed to the live filters.
    const filters = await renderHook(() => useFilters());
    expect(filters.result.current.filters.mode).toBe('buy');
  });

  it('localizes its copy (Dutch)', async () => {
    const { getByText } = await renderScreen('nl');
    expect(getByText('Tour overslaan')).toBeTruthy();
    expect(getByText('Welkom bij Realty AI Canvas')).toBeTruthy();
  });
});
