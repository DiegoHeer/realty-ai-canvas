import { useTranslation } from '@realty/i18n';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import {
  authErrorKey,
  AuthField,
  AuthScaffold,
  formatVerificationCode,
  MIN_PASSWORD_LENGTH,
  PrimaryButton,
  SuccessBadge,
} from '@/components/auth-ui';
import { useAuth } from '@/hooks/use-auth';
import { mapAuthFieldErrors } from '@/lib/auth-errors';
import { deferNavigation } from '@/lib/navigation';

/**
 * Forgot-password step 2 (pushed from the forgot-password screen): the user
 * enters the emailed code (allauth's `XXXX-XXXX`) plus a new password. On success
 * allauth completes the flow and returns an authenticated session, so the user is
 * signed straight in.
 *
 * As on the verify screen, we deliberately do NOT navigate during the auth-state
 * update (a pop in the same frame is react-native-screens' "recycled bitmap"
 * crash on Android). Instead we flip to an in-place success view whose Continue
 * button defers a `dismissAll` — a later frame, a separate gesture — to drop the
 * whole auth stack back to where the flow started.
 */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { resetPassword } = useAuth();

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ code?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Once reset, retitle the header and drop the back affordance so the
  // now-consumed code form can't be swiped/tapped back into.
  useEffect(() => {
    if (done) {
      navigation.setOptions({
        title: t('auth.resetDoneTitle'),
        headerBackVisible: false,
        gestureEnabled: false,
      });
    }
  }, [done, navigation, t]);

  async function submit() {
    const next: { code?: string; password?: string; confirm?: string } = {};
    if (!code.trim()) next.code = t('auth.errorCodeRequired');
    if (!password) next.password = t('auth.errorPasswordRequired');
    else if (password.length < MIN_PASSWORD_LENGTH) next.password = t('auth.errorPasswordTooShort');
    // The confirmation field is optional, but if filled it must match.
    if (confirm && confirm !== password) next.confirm = t('auth.errorPasswordMismatch');

    setErrors(next);
    setFormError(undefined);
    if (next.code || next.password || next.confirm) return;

    setSubmitting(true);
    const outcome = await resetPassword({ code, password });
    setSubmitting(false);

    if (outcome.ok === true) {
      setDone(true);
    } else if (outcome.ok === false) {
      // allauth tags the code as `key` and the new-password validators as
      // `password`; show each under its field, falling back to a banner.
      if (outcome.fieldErrors?.length) {
        const mapped = mapAuthFieldErrors(outcome.fieldErrors, ['key', 'password'], (k) => t(k));
        setErrors({ code: mapped.fieldErrors.key, password: mapped.fieldErrors.password });
        setFormError(mapped.formError);
      } else {
        setFormError(t(authErrorKey(outcome.code)));
      }
    }
  }

  if (done) {
    return (
      <AuthScaffold title={t('auth.resetDoneTitle')} subtitle={t('auth.resetDoneSubtitle')}>
        <View className="gap-6">
          <SuccessBadge />
          <PrimaryButton
            testID="auth-continue"
            label={t('auth.resetDoneCta')}
            onPress={() => deferNavigation(() => router.dismissAll())}
          />
        </View>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      <View className="gap-4">
        <AuthField
          label={t('auth.verifyCode')}
          value={code}
          onChangeText={(text) => setCode(formatVerificationCode(text))}
          error={errors.code}
          placeholder={t('auth.verifyCodePlaceholder')}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={9}
        />
        <AuthField
          label={t('auth.newPassword')}
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          placeholder={t('auth.newPasswordPlaceholder')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <AuthField
          label={t('auth.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
          placeholder={t('auth.confirmPasswordPlaceholder')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        {formError ? (
          <Text className="text-sm text-red-600 dark:text-red-400">{formError}</Text>
        ) : null}
        <PrimaryButton
          label={submitting ? t('auth.submitting') : t('auth.resetCta')}
          onPress={submit}
        />
      </View>
    </AuthScaffold>
  );
}
