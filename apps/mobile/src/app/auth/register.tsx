import { useTranslation } from '@realty/i18n';
import { AUTH_ENABLED } from '@realty/data';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  authErrorKey,
  availableOAuthProviders,
  AuthField,
  AuthScaffold,
  AuthSwitchLink,
  defaultOAuthProvider,
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  OAuthButton,
  OrDivider,
  PrimaryButton,
} from '@/components/auth-ui';
import { useAuth } from '@/hooks/use-auth';
import { mapAuthFieldErrors } from '@/lib/auth-errors';
import { deferNavigation } from '@/lib/navigation';

/**
 * Register screen (pushed from the profile guest card). Supports creating an
 * account with name/email/password plus the platform OAuth provider. With no
 * auth backend yet, a successful registration resolves into the mock session
 * (see `hooks/use-auth`).
 */
export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { registerWithEmail, signInWithGoogle, signInWithApple } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Mock mode surfaces the platform-default provider (Apple on iOS) for the
  // visual-regression path. Real mode only shows a provider when it's actually
  // usable on this platform + config (see availableOAuthProviders).
  const provider = AUTH_ENABLED ? 'google' : defaultOAuthProvider();
  const showOAuth = AUTH_ENABLED ? availableOAuthProviders().includes(provider) : true;

  async function onOAuthPress() {
    setFormError(undefined);
    if (!AUTH_ENABLED) {
      const action = provider === 'apple' ? signInWithApple : signInWithGoogle;
      action();
      deferNavigation(() => router.back());
      return;
    }
    const outcome = await signInWithGoogle();
    if (!outcome || outcome.ok === true) {
      deferNavigation(() => router.back());
    } else if (outcome.ok === false && outcome.code !== 'cancelled') {
      setFormError(t(authErrorKey(outcome.code)));
    }
  }

  async function submit() {
    const next: { name?: string; email?: string; password?: string } = {};
    if (!name.trim()) next.name = t('auth.errorNameRequired');
    if (!email.trim()) next.email = t('auth.errorEmailRequired');
    else if (!isValidEmail(email)) next.email = t('auth.errorEmailInvalid');
    if (!password) next.password = t('auth.errorPasswordRequired');
    else if (password.length < MIN_PASSWORD_LENGTH) next.password = t('auth.errorPasswordTooShort');

    setErrors(next);
    setFormError(undefined);
    if (next.name || next.email || next.password) return;

    setSubmitting(true);
    const outcome = await registerWithEmail({ name, email, password });
    setSubmitting(false);

    if (outcome.ok === 'verifyPending') {
      router.push('/auth/verify');
    } else if (outcome.ok === true) {
      // Defer the pop to avoid react-native-screens' "recycled bitmap" crash on
      // Android when a global state change and the navigation happen in the same
      // frame (same reason the settings screens defer their `router.back()`).
      deferNavigation(() => router.back());
    } else {
      // Surface the backend's password/email validator messages under their
      // field (allauth tags them `param: "password"` / `"email"`); the generic
      // banner is only used when there are no structured errors to show.
      if (outcome.fieldErrors?.length) {
        const mapped = mapAuthFieldErrors(
          outcome.fieldErrors,
          ['name', 'email', 'password'],
          (k) => t(k),
        );
        setErrors({
          name: mapped.fieldErrors.name,
          email: mapped.fieldErrors.email,
          password: mapped.fieldErrors.password,
        });
        setFormError(mapped.formError);
      } else {
        setFormError(t(authErrorKey(outcome.code)));
      }
    }
  }

  return (
    <AuthScaffold title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <View className="gap-4">
        <AuthField
          label={t('auth.name')}
          value={name}
          onChangeText={setName}
          error={errors.name}
          placeholder={t('auth.namePlaceholder')}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
        />
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
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        {formError ? (
          <Text className="text-sm text-red-600 dark:text-red-400">{formError}</Text>
        ) : null}
        <PrimaryButton
          label={submitting ? t('auth.submitting') : t('auth.registerCta')}
          onPress={submit}
        />
      </View>

      {showOAuth ? (
        <>
          <OrDivider />
          <OAuthButton provider={provider} onPress={onOAuthPress} />
        </>
      ) : null}

      <AuthSwitchLink
        prompt={t('auth.haveAccountPrompt')}
        actionLabel={t('auth.goToLogin')}
        onPress={() => router.replace('/auth/login')}
      />
    </AuthScaffold>
  );
}
