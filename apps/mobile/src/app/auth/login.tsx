import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
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

/**
 * Login screen (pushed from the profile guest card). Supports email/password
 * sign-in plus the platform OAuth provider. There is no auth backend yet, so a
 * successful sign-in resolves into the mock session (see `hooks/use-auth`).
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signInWithEmail, signInWithGoogle, signInWithApple } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const provider = defaultOAuthProvider();

  // Establish the session, then pop back to the profile a frame later. Deferring
  // the pop avoids react-native-screens' "recycled bitmap" crash on Android when
  // a global state change and the navigation happen in the same frame (same
  // reason the settings screens defer their `router.back()`).
  function completeAndDismiss(action: () => void) {
    action();
    requestAnimationFrame(() => router.back());
  }

  function submit() {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = t('auth.errorEmailRequired');
    else if (!isValidEmail(email)) next.email = t('auth.errorEmailInvalid');
    if (!password) next.password = t('auth.errorPasswordRequired');

    setErrors(next);
    if (next.email || next.password) return;

    completeAndDismiss(() => signInWithEmail(email));
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
        <PrimaryButton label={t('auth.logInCta')} onPress={submit} />
      </View>

      <OrDivider />

      <OAuthButton
        provider={provider}
        onPress={() =>
          completeAndDismiss(provider === 'apple' ? signInWithApple : signInWithGoogle)
        }
      />

      <AuthSwitchLink
        prompt={t('auth.noAccountPrompt')}
        actionLabel={t('auth.goToRegister')}
        onPress={() => router.replace('/auth/register')}
      />
    </AuthScaffold>
  );
}
