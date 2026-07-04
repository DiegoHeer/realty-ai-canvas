import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { type AuthErrorCode } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Placeholder grey that reads on both light and dark inputs (neutral-400). */
const PLACEHOLDER_COLOR = '#9ca3af';

/**
 * i18n key for an auth failure code. The screens render `t(authErrorKey(code))`
 * so NL/PT users get localized copy; unmapped/`generic` codes fall back to the
 * generic message.
 */
export function authErrorKey(code: AuthErrorCode): string {
  switch (code) {
    case 'invalid_credentials':
      return 'auth.errorInvalidCredentials';
    case 'invalid_code':
      return 'auth.errorCodeInvalid';
    case 'email_taken':
      return 'auth.errorEmailTaken';
    case 'cancelled':
      return 'auth.errorSignInCancelled';
    default:
      return 'auth.errorGeneric';
  }
}

/** Minimum password length enforced by the register form. */
export const MIN_PASSWORD_LENGTH = 8;

/** Pragmatic email check: a single `@` with non-empty, dot-bearing domain. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Normalize a typed/pasted code into the shape allauth emails: uppercase,
 * alphanumerics only, capped at 8 chars, grouped as `XXXX-XXXX`. (Mirrors
 * allauth's `generate_user_code` default — 8 chars, `dashed=True`, which stores
 * and emails the dashed string.) Submitting the dashed form matches the stored
 * code verbatim regardless of server-side normalization, so it's the robust
 * thing to send; input stays lenient (lowercase, spaces, a missing/extra dash
 * all collapse to the same canonical code). Shared by the email-verify and
 * password-reset screens, which both take this code.
 */
export function formatVerificationCode(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : cleaned;
}

/**
 * Screen scaffold shared by the login and register screens: a keyboard-aware,
 * scrollable column with a heading, an optional subtitle, and the form content.
 * Background and insets match the other pushed screens (settings).
 */
export function AuthScaffold({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-neutral-100 dark:bg-black">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View className="gap-1.5">
            <Text className="text-2xl font-bold text-neutral-900 dark:text-white">{title}</Text>
            {subtitle ? <Text className="text-base text-neutral-500">{subtitle}</Text> : null}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Labeled text input with an optional inline error message. Forwards all the
 * usual `TextInput` props (keyboardType, autoComplete, secureTextEntry, …); the
 * border turns red while an error is present.
 */
export function AuthField({
  label,
  error,
  ...inputProps
}: { label: string; error?: string } & TextInputProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</Text>
      <TextInput
        placeholderTextColor={PLACEHOLDER_COLOR}
        accessibilityLabel={label}
        className={`rounded-xl border bg-white px-4 py-3 text-base text-neutral-900 dark:bg-neutral-900 dark:text-white ${
          error ? 'border-red-500' : 'border-neutral-300 dark:border-neutral-700'
        }`}
        {...inputProps}
      />
      {error ? (
        <Text className="text-sm text-red-600 dark:text-red-400">{error}</Text>
      ) : null}
    </View>
  );
}

/** The screen's primary call-to-action (filled blue), matching the guest card. */
export function PrimaryButton({
  label,
  onPress,
  testID = 'auth-submit',
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      className="items-center rounded-xl bg-blue-600 py-3.5 active:opacity-80">
      <Text className="text-base font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

/**
 * Decorative green check on a tinted circle, shown on the success views (email
 * verified, password reset). Hidden from the accessibility tree — the heading
 * carries the meaning.
 */
export function SuccessBadge() {
  return (
    <View accessible={false} className="items-center py-2">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
        <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
          <Path
            d="M20 6 9 17l-5-5"
            stroke="#16a34a"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </View>
  );
}

/** "──── or ────" separator between the email form and the social buttons. */
export function OrDivider() {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-neutral-300 dark:bg-neutral-700" />
      <Text className="text-sm uppercase text-neutral-400">{t('auth.orDivider')}</Text>
      <View className="h-px flex-1 bg-neutral-300 dark:bg-neutral-700" />
    </View>
  );
}

export type OAuthProvider = 'apple' | 'google';

/**
 * The OAuth provider to surface for the current platform: Apple on iOS, Google
 * elsewhere (Android, and web for the demo export), matching platform norms.
 */
export function defaultOAuthProvider(): OAuthProvider {
  return Platform.OS === 'ios' ? 'apple' : 'google';
}

/**
 * Which OAuth providers are actually usable in real (backend) mode, given the
 * platform and the configured Google client ids. The native google-signin lib
 * and the backend both have hard requirements, so a button that can't succeed
 * must not be shown:
 *   - web: none — the native lib's web `signIn()` throws (sponsors-only).
 *   - iOS: `google` only when BOTH the web and iOS client ids are set (the iOS
 *     flow needs the iOS client id; the web client id scopes the id token).
 *   - Android: `google` only when the web client id is set — Android's native
 *     side skips the id-token request when webClientId is empty (null idToken).
 * Apple is intentionally absent until native Sign in with Apple lands.
 */
export function availableOAuthProviders(): OAuthProvider[] {
  if (Platform.OS === 'web') return [];
  if (Platform.OS === 'ios') {
    return GOOGLE_WEB_CLIENT_ID && GOOGLE_IOS_CLIENT_ID ? ['google'] : [];
  }
  return GOOGLE_WEB_CLIENT_ID ? ['google'] : [];
}

/** Google's four-color "G" mark. */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
}

/** Apple's logo mark, tinted by `color`. */
function AppleMark({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M17.05 12.04c-.03-2.62 2.14-3.88 2.24-3.94-1.22-1.79-3.12-2.03-3.8-2.06-1.62-.16-3.16.95-3.98.95-.82 0-1.74-.93-2.86-.91-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.08 2.67-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.35-3.5zM14.53 4.27c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.7-.93 2.7.98.08 1.98-.5 2.59-1.22z"
      />
    </Svg>
  );
}

/**
 * Social sign-in button for the active provider. Apple follows its sign-in
 * guidance (black on light, white on dark); Google uses a neutral surface with
 * the multicolor mark. Exposed `testID="oauth-button"` for tests regardless of
 * which provider is shown.
 */
export function OAuthButton({
  provider,
  onPress,
  disabled = false,
}: {
  provider: OAuthProvider;
  onPress: () => void;
  /** Ignore presses (and dim) while a sign-in is already in flight. */
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const dimmed = disabled ? 'opacity-60' : '';

  if (provider === 'apple') {
    // Apple: invert with the theme so the mark always contrasts the surface.
    const bg = dark ? 'bg-white' : 'bg-black';
    const fg = dark ? 'text-black' : 'text-white';
    const markColor = dark ? '#000000' : '#ffffff';
    return (
      <Pressable
        testID="oauth-button"
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={t('auth.continueWithApple')}
        className={`flex-row items-center justify-center gap-2.5 rounded-xl py-3.5 active:opacity-80 ${bg} ${dimmed}`}>
        <AppleMark color={markColor} />
        <Text className={`text-base font-semibold ${fg}`}>{t('auth.continueWithApple')}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      testID="oauth-button"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={t('auth.continueWithGoogle')}
      className={`flex-row items-center justify-center gap-2.5 rounded-xl border border-neutral-300 bg-white py-3.5 active:opacity-70 dark:border-neutral-700 dark:bg-neutral-900 ${dimmed}`}>
      <GoogleMark />
      <Text className="text-base font-semibold text-neutral-900 dark:text-white">
        {t('auth.continueWithGoogle')}
      </Text>
    </Pressable>
  );
}

/**
 * Footer row that cross-links the login and register screens, e.g.
 * "Don't have an account? Sign up".
 */
export function AuthSwitchLink({
  prompt,
  actionLabel,
  onPress,
}: {
  prompt: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View className="flex-row items-center justify-center gap-1.5 pt-1">
      <Text className="text-sm text-neutral-500">{prompt}</Text>
      <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} className="active:opacity-60">
        <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}
