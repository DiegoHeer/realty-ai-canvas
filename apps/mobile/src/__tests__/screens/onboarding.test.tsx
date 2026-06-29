import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataProvider, queryClient } from '@realty/data';
import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
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
