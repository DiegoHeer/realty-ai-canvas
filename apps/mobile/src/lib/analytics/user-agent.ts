import { Platform } from 'react-native';

import { APP_VERSION } from '@/constants/app';

/**
 * A stable User-Agent for Plausible ingest, e.g. `Huismus/1.0.0 (ios 17.5)`.
 *
 * Native `fetch` doesn't send a browser UA, and Plausible needs one both to
 * derive the (daily-rotating, anonymous) visitor hash and to classify OS. We
 * send app version + OS + OS version.
 *
 * Known limitation: unlike a browser, every install on the same OS/version
 * shares this UA, so Plausible's "unique visitor" count collapses toward
 * distinct IPs per day rather than distinct users. Pageview/event **totals**
 * stay accurate; treat unique visitors as approximate.
 */
export function buildUserAgent(): string {
  const os = Platform.OS;
  const osVersion = String(Platform.Version ?? '');
  return `Huismus/${APP_VERSION} (${os}${osVersion ? ` ${osVersion}` : ''})`;
}
