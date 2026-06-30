import { useTranslation } from '@realty/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  authErrorKey,
  AuthField,
  AuthScaffold,
  AuthSwitchLink,
  isValidEmail,
  PrimaryButton,
} from '@/components/auth-ui';
import { useAuth } from '@/hooks/use-auth';
import { mapAuthFieldErrors } from '@/lib/auth-errors';

/**
 * Forgot-password step 1 (pushed from the login screen): collect the email and
 * ask the backend to email a reset code. The field is prefilled from whatever
 * was typed on login (editable, so a typo can be fixed before the email is
 * sent). On success we advance to the reset screen to enter the code.
 */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState(emailParam ?? '');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!email.trim()) {
      setError(t('auth.errorEmailRequired'));
      return;
    }
    if (!isValidEmail(email)) {
      setError(t('auth.errorEmailInvalid'));
      return;
    }
    setError(undefined);
    setFormError(undefined);

    setSubmitting(true);
    const outcome = await requestPasswordReset(email);
    setSubmitting(false);

    if (outcome.ok === true) {
      router.push('/auth/reset-password');
    } else if (outcome.ok === false) {
      // Surface a backend email validator under the field; otherwise a banner.
      if (outcome.fieldErrors?.length) {
        const mapped = mapAuthFieldErrors(outcome.fieldErrors, ['email'], (k) => t(k));
        setError(mapped.fieldErrors.email);
        setFormError(mapped.formError);
      } else {
        setFormError(t(authErrorKey(outcome.code)));
      }
    }
  }

  return (
    <AuthScaffold title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      <View className="gap-4">
        <AuthField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          error={error}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoCorrect={false}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        {formError ? (
          <Text className="text-sm text-red-600 dark:text-red-400">{formError}</Text>
        ) : null}
        <PrimaryButton
          label={submitting ? t('auth.submitting') : t('auth.sendResetCode')}
          onPress={submit}
        />
      </View>

      <AuthSwitchLink
        prompt={t('auth.rememberedPrompt')}
        actionLabel={t('auth.goToLogin')}
        onPress={() => router.replace('/auth/login')}
      />
    </AuthScaffold>
  );
}
