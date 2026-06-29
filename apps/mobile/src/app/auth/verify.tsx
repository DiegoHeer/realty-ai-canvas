import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthField, AuthScaffold, PrimaryButton } from '@/components/auth-ui';
import { useAuth } from '@/hooks/use-auth';

/**
 * Email-verification step (pushed from the register screen). The backend
 * mandates verification by code before a session is issued; the user enters the
 * code we emailed and, on success, the session becomes active and we pop back.
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
      // Defer the pop to avoid the "Cannot update a component from inside the
      // function body of a different component" crash on Android when a global
      // state change and the navigation happen in the same frame (same reason
      // the other auth screens defer their `router.back()`).
      requestAnimationFrame(() => router.back());
    } else if (outcome.ok === false) {
      setError(outcome.error);
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
