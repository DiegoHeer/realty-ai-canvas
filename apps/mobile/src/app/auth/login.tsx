import { useTranslation } from '@realty/i18n';
import { AUTH_ENABLED } from '@realty/data';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  authErrorKey,
  AuthField,
  AuthScaffold,
  AuthSwitchLink,
  defaultOAuthProvider,
  isValidEmail,
  OAuthButton,
  OrDivider,
  PrimaryButton,
} from '@/components/auth-ui';
import { useAuth } from '@/hooks/use-auth';
import { mapAuthFieldErrors } from '@/lib/auth-errors';
import { deferNavigation } from '@/lib/navigation';

/**
 * Login screen (pushed from the profile guest card). Supports email/password
 * sign-in plus the platform OAuth provider. A successful sign-in stores the
 * session and pops back to the profile screen.
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signInWithEmail, signInWithGoogle, signInWithApple } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const provider = defaultOAuthProvider();

  async function submit() {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = t('auth.errorEmailRequired');
    else if (!isValidEmail(email)) next.email = t('auth.errorEmailInvalid');
    if (!password) next.password = t('auth.errorPasswordRequired');

    setErrors(next);
    setFormError(undefined);
    if (next.email || next.password) return;

    setSubmitting(true);
    const outcome = await signInWithEmail(email, password);
    setSubmitting(false);

    if (outcome.ok === true) {
      // Defer the pop to avoid react-native-screens' "recycled bitmap" crash on
      // Android when a global state change and the navigation happen in the same
      // frame (same reason the settings screens defer their `router.back()`).
      deferNavigation(() => router.back());
    } else if (outcome.ok === false) {
      // Prefer the backend's structured field errors (e.g. the mismatch tagged to
      // `param: "password"`); only fall back to the generic banner when none exist.
      if (outcome.fieldErrors?.length) {
        const mapped = mapAuthFieldErrors(outcome.fieldErrors, ['email', 'password'], (k) => t(k));
        setErrors({ email: mapped.fieldErrors.email, password: mapped.fieldErrors.password });
        setFormError(mapped.formError);
      } else {
        setFormError(t(authErrorKey(outcome.code)));
      }
    }
  }

  return (
    <AuthScaffold title={t('auth.logInTitle')} subtitle={t('auth.logInSubtitle')}>
      <View className="gap-4">
        <AuthField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoCorrect={false}
        />
        <AuthField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          placeholder={t('auth.passwordPlaceholder')}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        {formError ? (
          <Text className="text-sm text-red-600 dark:text-red-400">{formError}</Text>
        ) : null}
        <PrimaryButton
          label={submitting ? t('auth.submitting') : t('auth.logInCta')}
          onPress={submit}
        />
      </View>

      {!AUTH_ENABLED ? (
        <>
          <OrDivider />
          <OAuthButton
            provider={provider}
            onPress={() => {
              const action = provider === 'apple' ? signInWithApple : signInWithGoogle;
              action();
              deferNavigation(() => router.back());
            }}
          />
        </>
      ) : null}

      <AuthSwitchLink
        prompt={t('auth.noAccountPrompt')}
        actionLabel={t('auth.goToRegister')}
        onPress={() => router.replace('/auth/register')}
      />
    </AuthScaffold>
  );
}
