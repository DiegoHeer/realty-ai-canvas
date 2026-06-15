import '@/global.css';
import '@/i18n';

import { DataProvider } from '@realty/data';
import { i18n, I18nextProvider, useTranslation } from '@realty/i18n';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

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
    <I18nextProvider i18n={i18n}>
      <DataProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style={statusBarStyle} />
          <AnimatedSplashOverlay />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="listing/[id]"
              options={{ headerShown: true, title: t('tabs.listings') }}
            />
          </Stack>
        </ThemeProvider>
      </DataProvider>
    </I18nextProvider>
  );
}
