import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { Pressable, Switch, Text, View } from 'react-native';

import { InfoCard, Paragraph, SettingsContentScreen } from '@/components/settings-content';
import { Brand } from '@/constants/theme';
import { useAnalyticsOptOut } from '@/lib/analytics';

/**
 * Privacy & security page (pushed from the profile screen). Static copy that
 * spells out the zero-data stance: no user data collected, only anonymous
 * in-app usage measured, and search/preferences never collected or resold.
 * The last card lets the user opt out of that anonymous usage measurement.
 */
export default function PrivacySettingsScreen() {
  const { t } = useTranslation();
  const { optedOut, setOptedOut } = useAnalyticsOptOut();
  const router = useRouter();

  return (
    <SettingsContentScreen>
      <InfoCard title={t('privacyPage.zeroDataTitle')}>
        <Paragraph>{t('privacyPage.zeroDataBody')}</Paragraph>
      </InfoCard>
      <InfoCard title={t('privacyPage.behaviorTitle')}>
        <Paragraph>{t('privacyPage.behaviorBody')}</Paragraph>
      </InfoCard>
      <InfoCard title={t('privacyPage.noResaleTitle')}>
        <Paragraph>{t('privacyPage.noResaleBody')}</Paragraph>
      </InfoCard>
      <InfoCard title={t('privacyPage.optOutTitle')}>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg text-neutral-900 dark:text-white">
              {t('privacyPage.optOutLabel')}
            </Text>
            <Text className="text-sm text-neutral-500">
              {t('privacyPage.optOutDescription')}
            </Text>
          </View>
          <Switch
            value={!optedOut}
            onValueChange={(enabled) => setOptedOut(!enabled)}
            trackColor={{ true: Brand.blue }}
          />
        </View>
      </InfoCard>

      <InfoCard>
        <Pressable
          onPress={() => router.push('/settings/legal/privacy-policy')}
          accessibilityRole="button"
          className="flex-row items-center justify-between active:opacity-60">
          <Text className="text-lg text-neutral-900 dark:text-white">
            {t('privacyPolicyPage.title')}
          </Text>
          <Text className="text-xl text-neutral-400">›</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings/legal/terms-of-use')}
          accessibilityRole="button"
          className="flex-row items-center justify-between border-t border-neutral-100 pt-3 active:opacity-60 dark:border-neutral-800">
          <Text className="text-lg text-neutral-900 dark:text-white">
            {t('termsOfUsePage.title')}
          </Text>
          <Text className="text-xl text-neutral-400">›</Text>
        </Pressable>
      </InfoCard>
    </SettingsContentScreen>
  );
}
