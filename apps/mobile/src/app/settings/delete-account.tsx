import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Placeholder grey that reads on both light and dark inputs (neutral-400). */
const PLACEHOLDER_COLOR = '#9ca3af';

const STROKE = { strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Lucide-style "alert-triangle" — the warning sign shown in the middle of the page. */
function AlertTriangleIcon({ size = 40, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke={color}
        {...STROKE}
      />
      <Path d="M12 9v4" stroke={color} {...STROKE} />
      <Path d="M12 17h.01" stroke={color} {...STROKE} />
    </Svg>
  );
}

/** Lucide-style "trash-2" — leads the destructive confirm button. */
function TrashIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6h18" stroke={color} {...STROKE} />
      <Path
        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        stroke={color}
        {...STROKE}
      />
      <Path d="M10 11v6" stroke={color} {...STROKE} />
      <Path d="M14 11v6" stroke={color} {...STROKE} />
    </Svg>
  );
}

type Status = 'idle' | 'working' | 'error';

/** Map a data-layer DeleteAccountErrorCode to its `deleteAccountPage.*` message key. */
const ERROR_KEY: Record<string, string> = {
  password_incorrect: 'errorPasswordIncorrect',
  reauthentication_required: 'errorReauthRequired',
  staff_account: 'errorStaff',
  generic: 'errorGeneric',
};

/**
 * Delete-account confirmation screen (pushed from the profile Delete account
 * button). Shows the warning sign + irreversible-consequences copy, then requires
 * fresh re-authentication before deleting:
 *   - password accounts enter their password (verified server-side);
 *   - Google accounts re-authenticate with Google (a fresh provider-token login)
 *     immediately before the delete call.
 * On success the session is already torn down (see useAuth.deleteAccount), so we
 * pop back to the profile, which now shows the signed-out (guest) state.
 */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const scheme = useColorScheme();
  const { user, deleteAccount, signInWithGoogle } = useAuth();

  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Guard post-await setState against a mid-flight unmount.
  const mounted = useRef(true);
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  // Deleting signs the user out, which flips `user` to null and re-renders this
  // screen before we navigate away — render nothing rather than read a null user.
  if (!user) return <View className="flex-1 bg-neutral-100 dark:bg-black" />;

  const provider = user.provider;
  const showPasswordField = provider !== 'google';
  const primaryIsGoogle = provider === 'google';
  // Only when the sign-in method is unknown (session cached before this feature)
  // do we surface Google as a secondary option alongside the password field.
  const showGoogleLink = provider === undefined;
  const working = status === 'working';

  function fail(key: string) {
    if (!mounted.current) return;
    setStatus('error');
    setErrorKey(key);
  }

  // Account gone + session torn down → show the success screen. `replace` (not
  // push) so the back stack no longer holds this now-inert screen.
  function onDeleted() {
    if (mounted.current) router.replace('/settings/account-deleted');
  }

  async function runPasswordDelete() {
    if (!password.trim()) {
      fail('errorPasswordRequired');
      return;
    }
    setStatus('working');
    setErrorKey(null);
    const outcome = await deleteAccount(password);
    if (!mounted.current) return;
    if (outcome.ok) return onDeleted();
    fail(ERROR_KEY[outcome.code] ?? 'errorGeneric');
  }

  async function runGoogleDelete() {
    setStatus('working');
    setErrorKey(null);
    // Re-authenticate with Google first; this refreshes the server-side session
    // so the delete call passes the recent-reauthentication gate.
    const reauth = await signInWithGoogle();
    if (!mounted.current) return;
    if (reauth.ok !== true) {
      fail(reauth.ok === false && reauth.code === 'oauth_cancelled' ? 'cancelledGoogle' : 'errorGeneric');
      return;
    }
    const outcome = await deleteAccount();
    if (!mounted.current) return;
    if (outcome.ok) return onDeleted();
    fail(ERROR_KEY[outcome.code] ?? 'errorGeneric');
  }

  // Enabled unless a delete is already in flight — an empty password is caught on
  // press (runPasswordDelete) so we can explain what's missing instead of a dead button.
  const confirmDisabled = working;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-neutral-100 dark:bg-black">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 24, gap: 20, alignItems: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Warning sign in the middle of the page. */}
          <View className="mt-4 h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
            <AlertTriangleIcon size={44} color={scheme === 'dark' ? '#f87171' : '#dc2626'} />
          </View>

          <Text className="text-center text-2xl font-bold text-neutral-900 dark:text-white">
            {t('deleteAccountPage.title')}
          </Text>
          <Text className="text-center text-base leading-6 text-neutral-500">
            {t('deleteAccountPage.warning')}
          </Text>

          {showPasswordField ? (
            <View className="w-full gap-1.5">
              <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {t('deleteAccountPage.passwordLabel')}
              </Text>
              <TextInput
                value={password}
                onChangeText={(next) => {
                  setPassword(next);
                  if (status === 'error') setStatus('idle');
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!working}
                placeholder={t('deleteAccountPage.passwordPlaceholder')}
                placeholderTextColor={PLACEHOLDER_COLOR}
                accessibilityLabel={t('deleteAccountPage.passwordLabel')}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
            </View>
          ) : (
            <Text className="text-center text-sm text-neutral-500">
              {t('deleteAccountPage.googleNote')}
            </Text>
          )}

          <ConfirmButton
            label={working ? t('deleteAccountPage.deleting') : t('deleteAccountPage.confirm')}
            busy={working}
            disabled={confirmDisabled}
            onPress={primaryIsGoogle ? runGoogleDelete : runPasswordDelete}
          />

          {showGoogleLink ? (
            <Pressable
              onPress={runGoogleDelete}
              disabled={working}
              accessibilityRole="button"
              className="active:opacity-60">
              <Text className="text-center text-sm font-medium text-neutral-500 underline">
                {t('deleteAccountPage.googleReauthLink')}
              </Text>
            </Pressable>
          ) : null}

          {status === 'error' && errorKey ? (
            <Text
              accessibilityRole="alert"
              className="text-center text-sm text-red-600 dark:text-red-400">
              {t(`deleteAccountPage.${errorKey}`)}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Destructive red pill: trash icon + label, a spinner while the delete is in flight. */
function ConfirmButton({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID="delete-account-confirm"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      className={`w-full flex-row items-center justify-center gap-2 rounded-full bg-red-600 py-4 ${
        disabled && !busy ? 'opacity-50' : 'active:opacity-80'
      }`}>
      {busy ? <ActivityIndicator color="#ffffff" /> : <TrashIcon size={20} color="#ffffff" />}
      <Text className="text-base font-semibold text-white">{label}</Text>
    </Pressable>
  );
}
