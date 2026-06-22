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
  MIN_PASSWORD_LENGTH,
  OAuthButton,
  OrDivider,
  PrimaryButton,
} from '@/components/auth-ui';
import { useAuth } from '@/hooks/use-auth';

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

  const provider = defaultOAuthProvider();

  // See the note in `login.tsx`: defer the pop a frame so the auth-state change
  // and navigation don't share a frame (Android recycled-bitmap crash).
  function completeAndDismiss(action: () => void) {
    action();
    requestAnimationFrame(() => router.back());
  }

  function submit() {
    const next: { name?: string; email?: string; password?: string } = {};
    if (!name.trim()) next.name = t('auth.errorNameRequired');
    if (!email.trim()) next.email = t('auth.errorEmailRequired');
    else if (!isValidEmail(email)) next.email = t('auth.errorEmailInvalid');
    if (!password) next.password = t('auth.errorPasswordRequired');
    else if (password.length < MIN_PASSWORD_LENGTH) next.password = t('auth.errorPasswordTooShort');

    setErrors(next);
    if (next.name || next.email || next.password) return;

    completeAndDismiss(() => registerWithEmail({ name, email }));
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
        <PrimaryButton label={t('auth.registerCta')} onPress={submit} />
      </View>

      <OrDivider />

      <OAuthButton
        provider={provider}
        onPress={() =>
          completeAndDismiss(provider === 'apple' ? signInWithApple : signInWithGoogle)
        }
      />

      <AuthSwitchLink
        prompt={t('auth.haveAccountPrompt')}
        actionLabel={t('auth.goToLogin')}
        onPress={() => router.replace('/auth/login')}
      />
    </AuthScaffold>
  );
}
