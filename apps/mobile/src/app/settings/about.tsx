import { useTranslation } from '@realty/i18n';
import Constants from 'expo-constants';
import { Text, View } from 'react-native';

import { InfoCard, Paragraph, SettingsContentScreen } from '@/components/settings-content';

// Single source of truth for the displayed version is the Expo app config
// (app.json → expo.version); fall back gracefully if it isn't populated.
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/**
 * About page (pushed from the profile screen): what the app is, what you can do
 * with it, and the current version.
 */
export default function AboutSettingsScreen() {
  const { t } = useTranslation();

  return (
    <SettingsContentScreen>
      <InfoCard title={t('common.appName')}>
        <Paragraph>{t('aboutPage.intro')}</Paragraph>
        <Paragraph>{t('aboutPage.mission')}</Paragraph>
      </InfoCard>

      <InfoCard>
        <View className="flex-row items-center justify-between">
          <Text className="text-base text-neutral-900 dark:text-white">
            {t('aboutPage.version')}
          </Text>
          <Text className="text-base text-neutral-500">{APP_VERSION}</Text>
        </View>
      </InfoCard>
    </SettingsContentScreen>
  );
}
