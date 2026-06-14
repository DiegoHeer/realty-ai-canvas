import '@/global.css';
import '@/i18n';

import { DataProvider } from '@realty/data';
import { i18n, I18nextProvider, useTranslation } from '@realty/i18n';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();

  return (
    <I18nextProvider i18n={i18n}>
      <DataProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
