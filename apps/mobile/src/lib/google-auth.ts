import { GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '@realty/data';
import { AuthRequest, exchangeCodeAsync, makeRedirectUri, ResponseType } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/**
 * Obtains a Google **id_token** on the device, for allauth's provider-token
 * flow (`POST /_allauth/app/v1/auth/provider/token`). No Google SDK and no
 * client secret are involved — just Google's standard OAuth endpoints driven
 * through expo-auth-session:
 *
 * - **Web**: OIDC implicit flow (`response_type=id_token` + nonce) with the
 *   Web client id, in a popup. The popup returns to `/auth/callback`, whose
 *   `maybeCompleteAuthSession()` hands the URL back to `promptAsync`. Google
 *   console setup: the web origin under "Authorized JavaScript origins" and
 *   `<origin>/auth/callback` under "Authorized redirect URIs".
 * - **Android/iOS**: code + PKCE with the platform's installed-app client id
 *   (no secret; the token exchange happens in-app against Google's token
 *   endpoint). Google requires the reversed-client-id custom scheme as the
 *   redirect, which must be registered in the native build — see
 *   docs/oauth-social-login.md; gated off until
 *   EXPO_PUBLIC_GOOGLE_{ANDROID,IOS}_CLIENT_ID is provided.
 */
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

/** The Google OAuth client id for this platform ('' when not configured). */
export function googleClientId(): string {
  switch (Platform.OS) {
    case 'web':
      return GOOGLE_WEB_CLIENT_ID;
    case 'ios':
      return GOOGLE_IOS_CLIENT_ID;
    case 'android':
      return GOOGLE_ANDROID_CLIENT_ID;
    // Any other platform (windows/macos/…) has no configured client → sign-in
    // is unavailable rather than silently borrowing the Android id.
    default:
      return '';
  }
}

/** Whether "Continue with Google" can work on this platform/build. */
export function isGoogleSignInAvailable(): boolean {
  return googleClientId() !== '';
}

export type GoogleSignInResult =
  | { kind: 'success'; idToken: string; clientId: string }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

/**
 * Redirect scheme mandated by Google for installed apps (Android and iOS):
 * the reversed client id (`123-abc.apps.googleusercontent.com` →
 * `com.googleusercontent.apps.123-abc:/oauthredirect`). The scheme must be
 * registered in the native build (app.json `scheme`) for the OS to route the
 * browser's redirect back into the app.
 */
function installedAppRedirectUri(clientId: string): string {
  const reversed = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${reversed}:/oauthredirect`;
}

/**
 * Run the browser round-trip and resolve with a Google id_token (or a
 * cancelled/failed marker — this never throws). The id_token's audience is
 * `clientId`, which the backend checks, so it is returned alongside.
 */
export async function requestGoogleIdToken(): Promise<GoogleSignInResult> {
  const clientId = googleClientId();
  if (!clientId) return { kind: 'failed' };
  try {
    return Platform.OS === 'web'
      ? await requestViaImplicitFlow(clientId)
      : await requestViaCodeFlow(clientId);
  } catch {
    return { kind: 'failed' };
  }
}

/**
 * The `nonce` claim from a JWT's payload, or undefined if absent/unparseable.
 * Web-only helper (runs in the browser, where `atob` exists); we only read the
 * claim — signature verification is the backend's job in `verify_token`.
 */
function idTokenNonce(idToken: string): string | undefined {
  const payload = idToken.split('.')[1];
  if (!payload) return undefined;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { nonce?: unknown };
    return typeof claims.nonce === 'string' ? claims.nonce : undefined;
  } catch {
    return undefined;
  }
}

/** Web: implicit OIDC — the id_token comes back in the redirect fragment. */
async function requestViaImplicitFlow(clientId: string): Promise<GoogleSignInResult> {
  // OIDC requires a nonce with response_type=id_token; Google echoes it back in
  // the token. We generate a fresh one and verify the round-trip below, which
  // binds the token to *this* request (replay / token-injection protection).
  // CSRF on the redirect is separately covered by expo-auth-session's `state`.
  const nonce = Crypto.randomUUID();
  const request = new AuthRequest({
    clientId,
    redirectUri: makeRedirectUri({ path: 'auth/callback' }),
    scopes: GOOGLE_SCOPES,
    responseType: ResponseType.IdToken,
    // PKCE belongs to the code flow; Google rejects a code_challenge here.
    usePKCE: false,
    extraParams: { nonce },
  });
  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  if (result.type === 'success' && typeof result.params.id_token === 'string') {
    // Reject a token whose nonce doesn't match the one we just sent.
    if (idTokenNonce(result.params.id_token) !== nonce) return { kind: 'failed' };
    return { kind: 'success', idToken: result.params.id_token, clientId };
  }
  return result.type === 'cancel' || result.type === 'dismiss'
    ? { kind: 'cancelled' }
    : { kind: 'failed' };
}

/**
 * Native: authorization code + PKCE, then exchange the code for tokens in-app
 * (installed-app clients have no secret). The id_token rides along in the
 * token response.
 */
async function requestViaCodeFlow(clientId: string): Promise<GoogleSignInResult> {
  const redirectUri = installedAppRedirectUri(clientId);
  const request = new AuthRequest({
    clientId,
    redirectUri,
    scopes: GOOGLE_SCOPES,
    responseType: ResponseType.Code,
  });
  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  if (result.type === 'cancel' || result.type === 'dismiss') return { kind: 'cancelled' };
  if (result.type !== 'success' || typeof result.params.code !== 'string') {
    return { kind: 'failed' };
  }
  const tokens = await exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
    },
    GOOGLE_DISCOVERY,
  );
  if (typeof tokens.idToken !== 'string' || !tokens.idToken) return { kind: 'failed' };
  return { kind: 'success', idToken: tokens.idToken, clientId };
}
