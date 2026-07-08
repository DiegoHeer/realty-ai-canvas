import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// On web, Google redirects the OAuth popup here (the registered redirect URI,
// `<origin>/auth/callback`). This call — at module scope, so it runs before
// anything renders — hands the popup's URL (with the `#id_token=…` fragment)
// back to the `promptAsync` awaiting in the opener window and closes the
// popup. On native it is a no-op (the auth session catches the redirect
// itself), and this route is only a deep-link safety net.
WebBrowser.maybeCompleteAuthSession();

/**
 * Fallback for when the route is reached as a real navigation (popup blocked,
 * stale deep link, direct visit): there is nothing to show, go home.
 */
export default function AuthCallbackScreen() {
  return <Redirect href="/" />;
}
