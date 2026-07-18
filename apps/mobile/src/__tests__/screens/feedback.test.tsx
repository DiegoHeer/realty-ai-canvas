import { initI18n } from '@realty/i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import type { ReactTestInstance } from 'react-test-renderer';

import FeedbackScreen from '@/app/settings/feedback';

// The screen posts through @realty/data's submitFeedback. Replace the module
// with a plain spread of the real one so the export is a writable jest.fn (the
// real barrel re-exports are non-configurable getters), then script its outcome
// per test — no real network request fires. (Same approach as login.test.tsx.)
jest.mock('@realty/data', () => ({
  ...jest.requireActual('@realty/data'),
  submitFeedback: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { submitFeedback } = require('@realty/data') as { submitFeedback: jest.Mock };

async function renderScreen(language: 'en' | 'nl' = 'en') {
  const i18n = initI18n(language);
  // changeLanguage is async; apply before asserting on localized copy.
  await i18n.changeLanguage(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <FeedbackScreen />
    </I18nextProvider>,
  );
}

// One interaction per act() so each re-render settles before the next read
// (see the note in login.test.tsx).
async function typeInto(input: ReactTestInstance, text: string) {
  await act(async () => {
    fireEvent.changeText(input, text);
  });
}

async function tap(element: ReactTestInstance) {
  await act(async () => {
    fireEvent.press(element);
  });
}

beforeEach(() => {
  submitFeedback.mockReset();
});

describe('FeedbackScreen', () => {
  it('does not submit until there is non-whitespace text', async () => {
    const { getByTestId, getByPlaceholderText } = await renderScreen('en');

    await tap(getByTestId('feedback-submit'));
    expect(submitFeedback).not.toHaveBeenCalled();

    await typeInto(getByPlaceholderText('Share your thoughts…'), '   ');
    await tap(getByTestId('feedback-submit'));
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it('submits the trimmed message with device/app context and confirms sent', async () => {
    submitFeedback.mockResolvedValue({ id: 1, created_at: '2026-07-11T00:00:00Z' });
    const { getByTestId, getByPlaceholderText, findByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('Share your thoughts…'), '  Love the app  ');
    await tap(getByTestId('feedback-submit'));

    expect(await findByText('Feedback sent')).toBeOnTheScreen();
    // jest-expo runs as iOS; expo-constants is mocked to version 1.0.0.
    expect(submitFeedback).toHaveBeenCalledWith({
      message: 'Love the app',
      app_version: '1.0.0',
      platform: 'ios',
      locale: 'en',
    });
    // The field clears so more can be sent.
    expect(getByPlaceholderText('Share your thoughts…').props.value).toBe('');
  });

  it('shows an inline error and keeps the text for a retry when the send fails', async () => {
    submitFeedback
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ id: 2, created_at: '2026-07-11T00:00:00Z' });
    const { getByTestId, getByPlaceholderText, findByText } = await renderScreen('en');

    await typeInto(getByPlaceholderText('Share your thoughts…'), 'Something broke');
    await tap(getByTestId('feedback-submit'));

    expect(await findByText("Couldn't send your feedback. Please try again.")).toBeOnTheScreen();
    // Text is preserved so the same message can be retried.
    expect(getByPlaceholderText('Share your thoughts…').props.value).toBe('Something broke');

    await tap(getByTestId('feedback-submit'));
    expect(await findByText('Feedback sent')).toBeOnTheScreen();
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(2));
  });

  it('sends the active locale (Dutch) as context', async () => {
    submitFeedback.mockResolvedValue({ id: 3, created_at: '2026-07-11T00:00:00Z' });
    const { getByTestId, getByPlaceholderText, findByText } = await renderScreen('nl');

    await typeInto(getByPlaceholderText('Deel je gedachten…'), 'Mooie app');
    await tap(getByTestId('feedback-submit'));

    expect(await findByText('Feedback verzonden')).toBeOnTheScreen();
    expect(submitFeedback).toHaveBeenCalledWith(expect.objectContaining({ locale: 'nl' }));
  });
});
