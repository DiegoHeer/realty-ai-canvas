import type { ExpoConfig } from 'expo/config';

import appJson from './app.json';

/**
 * Dynamic Expo config. Everything lives in `app.json`; this file only overrides
 * the `@react-native-google-signin/google-signin` plugin so its `iosUrlScheme`
 * derives from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` at build time instead of the
 * committed placeholder (which passes the plugin's prefix-only validation and
 * would ship broken).
 *
 * A Google iOS client id looks like `<ID>.apps.googleusercontent.com`; its URL
 * scheme is the reversed form `com.googleusercontent.apps.<ID>`. When the env
 * var is unset we fall back to a clearly-nonfunctional scheme and rely on the
 * runtime availability model (auth-ui `availableOAuthProviders`) to hide the
 * iOS button, so nothing broken ships.
 */

const GOOGLE_SIGNIN_PLUGIN = '@react-native-google-signin/google-signin';
const UNCONFIGURED_IOS_URL_SCHEME = 'com.googleusercontent.apps.UNCONFIGURED';

/** Reverse a Google iOS client id into its URL scheme, or the unconfigured stub. */
function iosUrlScheme(): string {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) return UNCONFIGURED_IOS_URL_SCHEME;
  const suffix = '.apps.googleusercontent.com';
  const id = iosClientId.endsWith(suffix) ? iosClientId.slice(0, -suffix.length) : iosClientId;
  return `com.googleusercontent.apps.${id}`;
}

const base = appJson.expo as ExpoConfig;

const plugins: ExpoConfig['plugins'] = (base.plugins ?? []).map((plugin) => {
  if (Array.isArray(plugin) && plugin[0] === GOOGLE_SIGNIN_PLUGIN) {
    return [GOOGLE_SIGNIN_PLUGIN, { iosUrlScheme: iosUrlScheme() }];
  }
  return plugin;
});

const config: ExpoConfig = { ...base, plugins };

export default config;
