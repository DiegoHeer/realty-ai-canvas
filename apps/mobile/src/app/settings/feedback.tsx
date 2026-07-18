import { submitFeedback, type FeedbackIn, type FeedbackPlatform } from '@realty/data';
import { isSupportedLanguage, useTranslation } from '@realty/i18n';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { APP_VERSION } from '@/constants/app';

/** Placeholder grey that reads on both light and dark inputs (neutral-400). */
const PLACEHOLDER_COLOR = '#9ca3af';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Optional device/app context sent alongside the message for triage. `Platform.OS`
 * is narrowed to the values the backend accepts, the UI language is sent only when
 * it's one we ship, and the version is clamped to the backend's 20-char limit.
 */
function feedbackContext(language: string): Omit<FeedbackIn, 'message'> {
  const os = Platform.OS;
  const platform: FeedbackPlatform | undefined =
    os === 'ios' || os === 'android' || os === 'web' ? os : undefined;
  return {
    app_version: APP_VERSION.slice(0, 20),
    platform,
    locale: isSupportedLanguage(language) ? language : undefined,
  };
}

/** Feather-style check mark shown on the button once feedback is "sent". */
function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6L9 17l-5-5"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Feedback screen (pushed from the profile Support section). A multiline field
 * plus a submit button that POSTs to `/v1/feedback` (see `submitFeedback`). The
 * button moves idle → sending → sent in place and we stay on the screen (the
 * field clears) so more can be sent; a failed send surfaces an inline error and
 * keeps the text so it can be retried. Mirrors the keyboard-aware layout of the
 * auth screens (see `components/auth-ui.tsx`).
 */
export default function FeedbackScreen() {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  // Guards the post-await state updates from landing after the screen unmounts
  // mid-send.
  const mounted = useRef(true);
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  // Retryable from the initial idle state and after a failed send.
  const canSubmit = (status === 'idle' || status === 'error') && text.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    setStatus('sending');
    try {
      await submitFeedback({ message: text.trim(), ...feedbackContext(i18n.language) });
      if (!mounted.current) return;
      // Leave the button on its "sent" confirmation; typing again resets it.
      setStatus('sent');
      setText('');
    } catch {
      if (mounted.current) setStatus('error');
    }
  }

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-neutral-100 dark:bg-black">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text className="text-base text-neutral-500">{t('feedback.subtitle')}</Text>

          <View className="gap-1.5">
            <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t('feedback.label')}
            </Text>
            <TextInput
              value={text}
              onChangeText={(next) => {
                setText(next);
                // Typing after a terminal state returns the button to idle,
                // clearing a shown "sent" confirmation or error message.
                if (status === 'sent' || status === 'error') setStatus('idle');
              }}
              multiline
              autoFocus
              editable={status !== 'sending'}
              placeholder={t('feedback.placeholder')}
              placeholderTextColor={PLACEHOLDER_COLOR}
              accessibilityLabel={t('feedback.label')}
              style={{ minHeight: 160, textAlignVertical: 'top' }}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
          </View>

          <SubmitButton status={status} disabled={!canSubmit} onPress={submit} />

          {status === 'error' ? (
            <Text
              accessibilityRole="alert"
              className="text-center text-sm text-red-600 dark:text-red-400">
              {t('feedback.error')}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Stateful primary button: blue "Send feedback" when idle or after an error
 * (ready to retry), a disabled spinner while sending, and a green confirmation
 * once sent. Styling tracks `PrimaryButton` in `components/auth-ui.tsx`.
 */
function SubmitButton({
  status,
  disabled,
  onPress,
}: {
  status: Status;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  if (status === 'sent') {
    return (
      <View
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        className="flex-row items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5">
        <CheckIcon color="#ffffff" />
        <Text className="text-base font-semibold text-white">{t('feedback.sent')}</Text>
      </View>
    );
  }

  const sending = status === 'sending';

  return (
    <Pressable
      testID="feedback-submit"
      onPress={onPress}
      disabled={disabled || sending}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || sending, busy: sending }}
      className={`flex-row items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 ${
        disabled && !sending ? 'opacity-50' : 'active:opacity-80'
      }`}>
      {sending ? <ActivityIndicator color="#ffffff" /> : null}
      <Text className="text-base font-semibold text-white">
        {sending ? t('feedback.submitting') : t('feedback.submit')}
      </Text>
    </Pressable>
  );
}
