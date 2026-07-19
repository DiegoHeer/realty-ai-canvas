import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { Pressable, Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { InfoCard, Paragraph, SettingsContentScreen } from '@/components/settings-content';
import { Brand } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAnalyticsOptOut } from '@/lib/analytics';

/** Document/paper icon for the full-legal-text links below — mirrors profile.tsx's icon style. */
function PaperIcon({ color }: { color: string }) {
  const stroke = { strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={color}
        {...stroke}
      />
      <Path d="M14 2v6h6" stroke={color} {...stroke} />
      <Path d="M16 13H8" stroke={color} {...stroke} />
      <Path d="M16 17H8" stroke={color} {...stroke} />
    </Svg>
  );
}

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
  const scheme = useColorScheme();
  const iconColor = scheme === 'dark' ? '#ffffff' : '#171717';

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
          <View className="flex-row items-center gap-3">
            <PaperIcon color={iconColor} />
            <Text className="text-lg text-neutral-900 dark:text-white">
              {t('privacyPolicyPage.title')}
            </Text>
          </View>
          <Text className="text-xl text-neutral-400">›</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings/legal/terms-of-use')}
          accessibilityRole="button"
          className="flex-row items-center justify-between border-t border-neutral-100 pt-3 active:opacity-60 dark:border-neutral-800">
          <View className="flex-row items-center gap-3">
            <PaperIcon color={iconColor} />
            <Text className="text-lg text-neutral-900 dark:text-white">
              {t('termsOfUsePage.title')}
            </Text>
          </View>
          <Text className="text-xl text-neutral-400">›</Text>
        </Pressable>
      </InfoCard>
    </SettingsContentScreen>
  );
}
