import { initI18n } from '@realty/i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { LocationSearch } from '@/components/location-search';
import { FADE_HOLD_MS, FADE_IN_MS, FADE_OUT_MS } from '@/components/use-fading-text';

// The placeholder cross-fade runs on Animated's JS driver, which fake timers
// drive deterministically (each advance also steps rAF and Date.now).
jest.useFakeTimers();

async function renderSearch(placeholder?: string) {
  const i18n = initI18n('en');
  const wrap = (p?: string) => (
    <I18nextProvider i18n={i18n}>
      <LocationSearch onResult={jest.fn()} placeholder={p} />
    </I18nextProvider>
  );
  const utils = await render(wrap(placeholder));
  return { ...utils, rerenderWith: (p?: string) => utils.rerender(wrap(p)) };
}

describe('LocationSearch placeholder', () => {
  it('shows the default hint immediately on mount, without animating', async () => {
    const { getByText, getByPlaceholderText } = await renderSearch();
    // Visible overlay text plus the (transparent) native placeholder that
    // keeps the hint exposed to screen readers and the web DOM.
    expect(getByText('Search')).toBeOnTheScreen();
    expect(getByPlaceholderText('Search')).toBeOnTheScreen();
  });

  it('cross-fades on a hint change: old text through fade-out + hold, then the new one', async () => {
    const { getByText, queryByText, getByPlaceholderText, rerenderWith } = await renderSearch();

    await rerenderWith('Amsterdam');
    // The native (accessibility) placeholder swaps instantly…
    expect(getByPlaceholderText('Amsterdam')).toBeOnTheScreen();
    // …but the visible text still reads the old hint while it fades out.
    expect(getByText('Search')).toBeOnTheScreen();
    expect(queryByText('Amsterdam')).toBeNull();

    await act(() => jest.advanceTimersByTime(FADE_OUT_MS));
    expect(getByText('Search')).toBeOnTheScreen();

    // Past the hold the texts swap, and the new one fades in.
    await act(() => jest.advanceTimersByTime(FADE_HOLD_MS + 50));
    expect(getByText('Amsterdam')).toBeOnTheScreen();
    expect(queryByText('Search')).toBeNull();

    await act(() => jest.advanceTimersByTime(FADE_IN_MS));
    expect(getByText('Amsterdam')).toBeOnTheScreen();
  });

  it('retargets to the latest hint when it changes mid-fade', async () => {
    const { getByText, queryByText, rerenderWith } = await renderSearch();

    await rerenderWith('Amsterdam');
    await act(() => jest.advanceTimersByTime(FADE_OUT_MS / 2));
    await rerenderWith('Utrecht');

    // The superseded target must never appear; the final one does after its
    // own full fade-out + hold.
    await act(() => jest.advanceTimersByTime(FADE_OUT_MS + FADE_HOLD_MS + 50));
    expect(queryByText('Amsterdam')).toBeNull();
    expect(getByText('Utrecht')).toBeOnTheScreen();
  });

  it('hides the visible placeholder while the field has input', async () => {
    const { getByPlaceholderText, getByText, queryByText } = await renderSearch();

    await fireEvent.changeText(getByPlaceholderText('Search'), 'Delft');
    expect(queryByText('Search')).toBeNull();

    await fireEvent.changeText(getByPlaceholderText('Search'), '');
    expect(getByText('Search')).toBeOnTheScreen();
  });
});
