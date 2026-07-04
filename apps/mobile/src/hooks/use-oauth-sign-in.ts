import { AUTH_ENABLED } from '@realty/data';
import { useState } from 'react';

import { defaultOAuthProvider, type OAuthProvider } from '@/components/auth-ui';
import { useAuth, type AuthErrorCode } from '@/hooks/use-auth';
import { isGoogleSignInAvailable } from '@/lib/google-auth';

/**
 * Shared OAuth sign-in logic for the login and register screens. Owns:
 *   - provider selection (mock mode: platform default; real mode: Google only,
 *     the sole provider the backend supports),
 *   - whether the button should render (`showOAuth`) — real mode gates on
 *     {@link isGoogleSignInAvailable} (a client id configured for this
 *     platform) so no dead/unconfigured button ships,
 *   - an in-flight guard (`inFlight`) so a double-tap can't launch two flows,
 *   - firing the caller's `onSuccess` (success view) / `onError` (banner)
 *     callbacks. A user cancel surfaces `oauth_cancelled`, which maps to a
 *     soft "sign-in was cancelled" message rather than an alarming error.
 *
 * Mock mode keeps the original demo behavior: it synthesizes a provider session
 * and reports success, no outcome inspection needed.
 */
export function useOAuthSignIn({
  onSuccess,
  onError,
  onClearError,
}: {
  onSuccess: () => void;
  onError: (code: AuthErrorCode) => void;
  onClearError: () => void;
}) {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [inFlight, setInFlight] = useState(false);

  const provider: OAuthProvider = AUTH_ENABLED ? 'google' : defaultOAuthProvider();
  const showOAuth = AUTH_ENABLED ? isGoogleSignInAvailable() : true;

  async function onOAuthPress() {
    if (inFlight) return;
    onClearError();

    if (!AUTH_ENABLED) {
      const action = provider === 'apple' ? signInWithApple : signInWithGoogle;
      void action();
      onSuccess();
      return;
    }

    setInFlight(true);
    try {
      const outcome = await signInWithGoogle();
      if (outcome.ok === true) {
        onSuccess();
      } else if (outcome.ok === false) {
        onError(outcome.code);
      }
    } finally {
      setInFlight(false);
    }
  }

  return { provider, showOAuth, inFlight, onOAuthPress };
}
