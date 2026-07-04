import { useTranslation } from '@realty/i18n';
import { AUTH_ENABLED } from '@realty/data';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

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
import { isGoogleSignInAvailable } from '@/lib/google-auth';
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
  const [oauthBusy, setOauthBusy] = useState(false);

  // Mock mode keeps the platform-styled demo button; real mode offers Google
  // only (the sole provider the backend supports), and only on platforms where
  // a client id is configured — today that's web (see lib/google-auth).
  const provider = AUTH_ENABLED ? 'google' : defaultOAuthProvider();
  const showOAuth = AUTH_ENABLED ? isGoogleSignInAvailable() : true;

  async function submitOAuth() {
    if (oauthBusy) return;
    setOauthBusy(true);
    setFormError(undefined);
    const action = provider === 'apple' ? signInWithApple : signInWithGoogle;
    const outcome = await action();
    setOauthBusy(false);
    if (outcome.ok === true) {
      // Same deferred pop as the email path (recycled-bitmap crash, below).
      deferNavigation(() => router.back());
    } else if (outcome.ok === false) {
      setFormError(t(authErrorKey(outcome.code)));
    }
  }

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

  // Carry the typed email to the reset flow so it lands prefilled; omit the param
  // when blank so the reset screen just starts empty.
  function goToForgotPassword() {
    const trimmed = email.trim();
    router.push(
      trimmed ? { pathname: '/auth/forgot-password', params: { email: trimmed } } : '/auth/forgot-password',
    );
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
        <View className="-mt-1 items-end">
          <Pressable
            onPress={goToForgotPassword}
            accessibilityRole="link"
            hitSlop={8}
            className="active:opacity-60">
            <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              {t('auth.forgotLink')}
            </Text>
          </Pressable>
        </View>
        {formError ? (
          <Text className="text-sm text-red-600 dark:text-red-400">{formError}</Text>
        ) : null}
        <PrimaryButton
          label={submitting ? t('auth.submitting') : t('auth.logInCta')}
          onPress={submit}
        />
      </View>

      {showOAuth ? (
        <>
          <OrDivider />
          <OAuthButton provider={provider} onPress={submitOAuth} />
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
