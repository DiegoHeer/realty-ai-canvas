import { defaultLanguage, isSupportedLanguage } from '@realty/i18n';
import type { Listing } from '@realty/types';

import { WEB_BASE_URL } from '@/constants/app';

/**
 * The shareable web URL for a listing, e.g.
 * "https://huismusapp.com/nl/listing/martin-luther-kinglaan-129/11292".
 * Opening it with the app installed hands off to the native listing screen
 * (Universal Links on iOS, App Links on Android — see app.json); without the
 * app, huismusapp.com serves an SEO landing page for the same path.
 *
 * The slug is cosmetic — the trailing id is what the app actually looks up
 * (see app/[locale]/listing/[slug]/[id].tsx) — so a listing without one
 * (the backend has no street to derive it from) falls back to repeating the
 * id rather than breaking the URL shape.
 */
export function listingWebUrl(listing: Listing, language: string): string {
  const locale = isSupportedLanguage(language) ? language : defaultLanguage;
  const slug = listing.slug ?? listing.id;
  return `${WEB_BASE_URL}/${locale}/listing/${slug}/${listing.id}`;
}
