import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useOnboarding } from '@/lib/onboarding';

/**
 * Matches `useSegments()` against this route's shape (`[locale]/listing/[slug]/[id]`).
 * Colocated with the route it identifies so the two can't drift apart silently —
 * update this alongside any change to this file's path. Used by the root layout's
 * onboarding gate (see `app/_layout.tsx`) to defer to this screen's own
 * `completeOnboarding()` call instead of also redirecting.
 */
export function isSharedListingRoute(segments: string[]): boolean {
  return segments.length === 4 && segments[1] === 'listing';
}

/**
 * Landing target for the public share link
 * (huismusapp.com/:locale/listing/:slug/:id), reached via Universal Links
 * (iOS) / App Links (Android) when the app is installed. `locale` and `slug`
 * are cosmetic — only `id` is looked up — so this just forwards to the real
 * listing screen.
 *
 * Also marks onboarding done, so a fresh install opened via a shared link
 * skips straight to the listing instead of the intro tour. Waits for
 * `hydrated` first so this can't race the just-loaded persisted value (see
 * `lib/onboarding.ts`). The root layout's onboarding gate recognises this
 * route (via {@link isSharedListingRoute}) and defers to it instead of also
 * redirecting.
 */
export default function SharedListingRedirect() {
  const { id } = useLocalSearchParams<{ locale: string; slug: string; id: string }>();
  const { hydrated, completeOnboarding } = useOnboarding();

  useEffect(() => {
    if (!hydrated) return;
    completeOnboarding();
    router.replace(`/listing/${id}`);
  }, [hydrated, id, completeOnboarding]);

  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <ActivityIndicator />
    </View>
  );
}
