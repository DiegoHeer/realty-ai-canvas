import { useTranslation } from '@realty/i18n';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  authErrorKey,
  AuthField,
  AuthScaffold,
  formatVerificationCode,
  PrimaryButton,
  SuccessBadge,
} from '@/components/auth-ui';
import { useAuth } from '@/hooks/use-auth';
import { trackEmailVerified } from '@/lib/analytics';
import { mapAuthFieldErrors } from '@/lib/auth-errors';
import { deferNavigation } from '@/lib/navigation';

/**
 * Email-verification step (pushed from the register screen). The backend mandates
 * verification by code before a session is issued; the user enters the code we
 * emailed (allauth's `XXXX-XXXX`) and, on success, the session becomes active.
 *
 * On success we deliberately do NOT navigate: a pop/dismiss in the same frame as
 * the auth-state update is react-native-screens' "recycled bitmap" crash on
 * Android. Instead we flip to an in-place success view; its Continue button then
 * dismisses the whole auth stack (register + verify) back to where the user
 * launched the flow — a deferred `dismissAll`, on a later frame and a separate
 * user gesture.
 */
export default function VerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { verifyEmail } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);

  // Once verified, retitle the header and drop the back affordance so the
  // now-consumed code form can't be swiped/tapped back into.
  useEffect(() => {
    if (verified) {
      navigation.setOptions({
        title: t('auth.verifiedTitle'),
        headerBackVisible: false,
        gestureEnabled: false,
      });
    }
  }, [verified, navigation, t]);

  async function submit() {
    const entered = code.trim();
    if (!entered) {
      setError(t('auth.errorCodeRequired'));
      return;
    }
    setError(undefined);
    setSubmitting(true);
    const outcome = await verifyEmail(entered);
    setSubmitting(false);
    if (outcome.ok === true) {
      trackEmailVerified();
      setVerified(true);
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

  if (verified) {
    return (
      <AuthScaffold title={t('auth.verifiedTitle')} subtitle={t('auth.verifiedSubtitle')}>
        <View className="gap-6">
          <SuccessBadge />
          <PrimaryButton
            testID="auth-continue"
            label={t('auth.verifiedCta')}
            onPress={() => deferNavigation(() => router.dismissAll())}
          />
        </View>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold title={t('auth.verifyTitle')} subtitle={t('auth.verifySubtitle')}>
      <View className="gap-4">
        <AuthField
          label={t('auth.verifyCode')}
          value={code}
          onChangeText={(text) => setCode(formatVerificationCode(text))}
          error={error}
          placeholder={t('auth.verifyCodePlaceholder')}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={9}
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
