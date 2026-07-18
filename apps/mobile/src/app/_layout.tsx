import '@/global.css';
import '@/i18n';
// Hydrates the saved preferred cities and queues the launch map focus on the
// first one, so the map opens on it every boot (see lib/preferred-cities.ts).
import '@/lib/preferred-cities';

import { DataProvider } from '@realty/data';
import { i18n, I18nextProvider, useTranslation } from '@realty/i18n';
import { StatusBar } from 'expo-status-bar';
import {
  DarkTheme,
  DefaultTheme,
  router,
  Stack,
  ThemeProvider,
  useRootNavigationState,
  useSegments,
} from 'expo-router';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Importing these hooks also runs their module side-effects at boot: applying
// any saved appearance override, and hydrating the analytics opt-out flag.
import { useScreenView } from '@/lib/analytics';
import { useAppearance } from '@/lib/appearance';
import { useOnboarding } from '@/lib/onboarding';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { isSharedListingRoute } from '@/app/[locale]/listing/[slug]/[id]';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { appearance } = useAppearance();
  const { t } = useTranslation();

  // Auto-track a Plausible pageview on every route-pattern change (no-op unless
  // analytics is enabled and the user hasn't opted out).
  useScreenView();

  // Resolve the effective theme from the stored preference ('system' follows the
  // OS), then invert it for the status bar: dark icons on light, light on dark.
  const effectiveScheme = appearance === 'system' ? colorScheme : appearance;
  const statusBarStyle = effectiveScheme === 'dark' ? 'light' : 'dark';

  // First-run gate: once we know (post-hydration) the intro tour hasn't been
  // completed, send the user into it. Native only — the web export is the
  // demo/test surface and is never force-redirected (so the tour is reachable
  // there only by navigating to /onboarding directly). Waits for the root
  // navigator to mount before navigating.
  //
  // Skipped while on the shared-listing redirect (huismusapp.com share links,
  // app/[locale]/listing/[slug]/[id].tsx) — that screen completes onboarding
  // itself before forwarding to the listing, and both routing decisions read
  // the same onboarding state in the same commit, so whichever fired last
  // would otherwise win the race and could bounce a shared link into the tour.
  // Widened to string[] — expo-router's typed useSegments() return type comes
  // from the generated (gitignored) router.d.ts, which CI never regenerates,
  // collapsing to an overly-narrow tuple there and breaking the isSharedListingRoute
  // check below.
  const segments: string[] = useSegments();
  const isSharedListingLink = isSharedListingRoute(segments);
  const { status: onboardingStatus, hydrated: onboardingHydrated } = useOnboarding();
  const rootNavState = useRootNavigationState();
  const needsOnboarding =
    Platform.OS !== 'web' && onboardingHydrated && onboardingStatus !== 'done' && !isSharedListingLink;
  useEffect(() => {
    if (rootNavState?.key && needsOnboarding) router.replace('/onboarding');
  }, [rootNavState?.key, needsOnboarding]);

  return (
    // Roots the gesture system for react-native-gesture-handler (the area sheet's
    // drag gestures live in the (tabs) tree, not in a Modal, so they need this).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <DataProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <StatusBar style={statusBarStyle} />
            <AnimatedSplashOverlay />
            <Stack
              screenOptions={{
                headerShown: false,
                // iOS otherwise labels the back button with the previous route's
                // title — here "(tabs)", which has no title set. 'minimal' shows
                // just the chevron. Android/web ignore this and already behave.
                headerBackButtonDisplayMode: 'minimal',
              }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="onboarding"
                // Full-screen takeover: no header, and the iOS back-swipe is
                // disabled so the tour can't be partially dragged away (its own
                // Skip/Continue controls drive it instead).
                options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}
              />
              <Stack.Screen
                name="listing/[id]"
                options={{ headerShown: true, title: t('tabs.listings') }}
              />
              <Stack.Screen name="[locale]/listing/[slug]/[id]" options={{ headerShown: false }} />
              <Stack.Screen
                name="settings/language"
                options={{ headerShown: true, title: t('profile.language') }}
              />
              <Stack.Screen
                name="settings/appearance"
                options={{ headerShown: true, title: t('profile.appearance') }}
              />
              <Stack.Screen
                name="settings/filters"
                options={{ headerShown: true, title: t('filtersPage.title') }}
              />
              <Stack.Screen
                name="settings/notifications"
                options={{ headerShown: true, title: t('profile.notifications') }}
              />
              <Stack.Screen
                name="settings/map"
                options={{ headerShown: true, title: t('profile.map') }}
              />
              <Stack.Screen
                name="settings/subscription"
                options={{ headerShown: true, title: t('profile.subscription') }}
              />
              <Stack.Screen
                name="settings/privacy"
                options={{ headerShown: true, title: t('profile.privacy') }}
              />
              <Stack.Screen
                name="settings/help"
                options={{ headerShown: true, title: t('profile.help') }}
              />
              <Stack.Screen
                name="settings/about"
                options={{ headerShown: true, title: t('profile.about') }}
              />
              <Stack.Screen
                name="settings/feedback"
                options={{ headerShown: true, title: t('feedback.title') }}
              />
              <Stack.Screen
                name="auth/login"
                options={{ headerShown: true, title: t('auth.logInTitle') }}
              />
              <Stack.Screen
                name="auth/register"
                options={{ headerShown: true, title: t('auth.registerTitle') }}
              />
              <Stack.Screen
                name="auth/verify"
                options={{ headerShown: true, title: t('auth.verifyTitle') }}
              />
              <Stack.Screen
                name="auth/forgot-password"
                options={{ headerShown: true, title: t('auth.forgotTitle') }}
              />
              <Stack.Screen
                name="auth/reset-password"
                options={{ headerShown: true, title: t('auth.resetTitle') }}
              />
            </Stack>
          </ThemeProvider>
        </DataProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}
