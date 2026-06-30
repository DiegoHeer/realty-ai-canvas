import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { authErrorKey, AuthField, AuthScaffold, PrimaryButton } from '@/components/auth-ui';
import { useAuth } from '@/hooks/use-auth';
import { mapAuthFieldErrors } from '@/lib/auth-errors';

/**
 * Email-verification step (pushed from the register screen). The backend
 * mandates verification by code before a session is issued; the user enters the
 * code we emailed and, on success, the session becomes active. Verify sits two
 * pushes deep (profile → register → verify), so on success we dismiss the whole
 * auth stack back to the tabs rather than a single `back()` (which would land
 * on the register form).
 */
export default function VerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { verifyEmail } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!code.trim()) {
      setError(t('auth.errorCodeRequired'));
      return;
    }
    setError(undefined);
    setSubmitting(true);
    const outcome = await verifyEmail(code.trim());
    setSubmitting(false);
    if (outcome.ok === true) {
      // Defer the dismissal to avoid the "recycled bitmap" / cross-component
      // update crash on Android when a global state change and the navigation
      // happen in the same frame. dismissAll() unwinds the whole auth stack
      // (register + verify) back to the tabs, where the now-authenticated
      // profile is shown — a single back() would stop on the register form.
      requestAnimationFrame(() => router.dismissAll());
    } else if (outcome.ok === false) {
      // The verification code maps to allauth's `key` param; show its message
      // under the single code field, falling back to the generic coded message.
      if (outcome.fieldErrors?.length) {
        const mapped = mapAuthFieldErrors(outcome.fieldErrors, ['key', 'code'], (k) => t(k));
        setError(
          mapped.fieldErrors.key ??
            mapped.fieldErrors.code ??
            mapped.formError ??
            t(authErrorKey(outcome.code)),
        );
      } else {
        setError(t(authErrorKey(outcome.code)));
      }
    }
  }

  return (
    <AuthScaffold title={t('auth.verifyTitle')} subtitle={t('auth.verifySubtitle')}>
      <View className="gap-4">
        <AuthField
          label={t('auth.verifyCode')}
          value={code}
          onChangeText={setCode}
          error={error}
          placeholder={t('auth.verifyCodePlaceholder')}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <PrimaryButton
          label={submitting ? t('auth.submitting') : t('auth.verifyCta')}
          onPress={submit}
        />
      </View>
    </AuthScaffold>
  );
}
