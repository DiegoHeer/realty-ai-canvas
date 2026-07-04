import { AUTH_ENABLED } from '@realty/data';
import { useState } from 'react';

import { availableOAuthProviders, defaultOAuthProvider, type OAuthProvider } from '@/components/auth-ui';
import { useAuth, type AuthErrorCode } from '@/hooks/use-auth';

/**
 * Shared OAuth sign-in logic for the login and register screens. Owns:
 *   - provider selection (mock mode: platform default; real mode: Google only),
 *   - whether the button should render (`showOAuth`) — real mode gates on
 *     {@link availableOAuthProviders} so no dead/unconfigured button ships,
 *   - an in-flight guard (`inFlight`) so a double-tap can't launch two flows,
 *   - the cancel-is-silent policy (a `cancelled` outcome surfaces no error),
 *   - firing the caller's `onSuccess` (navigation) / `onError` (banner) callbacks.
 *
 * Mock mode keeps the original demo behavior: it synthesizes a provider session
 * and navigates back, no outcome inspection needed.
 */
export function useOAuthSignIn({
  onSuccess,
  onError,
  onClearError,
}: {
  onSuccess: () => void;
  onError: (code: Exclude<AuthErrorCode, 'cancelled'>) => void;
  onClearError: () => void;
}) {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [inFlight, setInFlight] = useState(false);

  const provider: OAuthProvider = AUTH_ENABLED ? 'google' : defaultOAuthProvider();
  const showOAuth = AUTH_ENABLED ? availableOAuthProviders().includes(provider) : true;

  async function onOAuthPress() {
    if (inFlight) return;
    onClearError();

    if (!AUTH_ENABLED) {
      const action = provider === 'apple' ? signInWithApple : signInWithGoogle;
      action();
      onSuccess();
      return;
    }

    setInFlight(true);
    try {
      const outcome = await signInWithGoogle();
      if (!outcome || outcome.ok === true) {
        onSuccess();
      } else if (outcome.ok === false && outcome.code !== 'cancelled') {
        // A user cancel is intentionally silent; everything else surfaces a banner.
        onError(outcome.code);
      }
    } finally {
      setInFlight(false);
    }
  }

  return { provider, showOAuth, inFlight, onOAuthPress };
}
