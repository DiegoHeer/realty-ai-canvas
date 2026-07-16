import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useOnboarding } from '@/lib/onboarding';

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
 * route (by segment shape) and defers to it instead of also redirecting.
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
