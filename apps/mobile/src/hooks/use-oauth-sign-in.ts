import { AUTH_ENABLED } from '@realty/data';
import { useState } from 'react';

import { useAuth, type AuthErrorCode } from '@/hooks/use-auth';
import { isGoogleSignInAvailable } from '@/lib/google-auth';

/**
 * Shared Google sign-in logic for the login and register screens (Google is the
 * only social provider the backend supports). Owns:
 *   - whether the button should render (`showOAuth`) — real mode gates on
 *     {@link isGoogleSignInAvailable} (a client id configured for this
 *     platform) so no dead/unconfigured button ships,
 *   - an in-flight guard (`inFlight`) so a double-tap can't launch two flows,
 *   - firing the caller's `onSuccess` (success view) / `onError` (banner)
 *     callbacks. A user cancel surfaces `oauth_cancelled`, which maps to a
 *     soft "sign-in was cancelled" message rather than an alarming error.
 *
 * Mock mode keeps the original demo behavior: it synthesizes a Google session
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
  const { signInWithGoogle } = useAuth();
  const [inFlight, setInFlight] = useState(false);

  const showOAuth = AUTH_ENABLED ? isGoogleSignInAvailable() : true;

  async function onOAuthPress() {
    if (inFlight) return;
    onClearError();

    if (!AUTH_ENABLED) {
      void signInWithGoogle();
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

  return { showOAuth, inFlight, onOAuthPress };
}
