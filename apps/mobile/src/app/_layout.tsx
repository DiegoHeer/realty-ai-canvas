import '@/global.css';
import '@/i18n';

import { DataProvider } from '@realty/data';
import { i18n, I18nextProvider, useTranslation } from '@realty/i18n';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Importing the hook also runs the module side-effect that applies any saved
// appearance override at boot.
import { useAppearance } from '@/lib/appearance';
import { AnimatedSplashOverlay } from '@/components/animated-icon';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { appearance } = useAppearance();
  const { t } = useTranslation();

  // Resolve the effective theme from the stored preference ('system' follows the
  // OS), then invert it for the status bar: dark icons on light, light on dark.
  const effectiveScheme = appearance === 'system' ? colorScheme : appearance;
  const statusBarStyle = effectiveScheme === 'dark' ? 'light' : 'dark';

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
                name="listing/[id]"
                options={{ headerShown: true, title: t('tabs.listings') }}
              />
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
                name="auth/login"
                options={{ headerShown: true, title: t('auth.logInTitle') }}
              />
              <Stack.Screen
                name="auth/register"
                options={{ headerShown: true, title: t('auth.registerTitle') }}
              />
            </Stack>
          </ThemeProvider>
        </DataProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}
