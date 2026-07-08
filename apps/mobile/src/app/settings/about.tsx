import { useTranslation } from '@realty/i18n';
import { Text, View } from 'react-native';

import { APP_VERSION } from '@/constants/app';
import { InfoCard, Paragraph, SettingsContentScreen } from '@/components/settings-content';

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
