import Constants from 'expo-constants';

export const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

/** Public web domain — Universal Links / App Links hand off to the native app. */
export const WEB_BASE_URL = 'https://huismusapp.com';
