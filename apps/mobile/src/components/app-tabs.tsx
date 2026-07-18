import { useTranslation } from '@realty/i18n';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useMapBackRoot } from '@/hooks/use-map-back-root';
import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  const colors = useTheme();
  const { t } = useTranslation();
  // Android back returns to the map tab from anywhere in the tab bar.
  useMapBackRoot();

  return (
    <NativeTabs
      // 'none' keeps the tab router away from the Android back button so
      // useMapBackRoot owns it — the router would otherwise anchor back to the
      // first trigger (Listings), and back on the map now bubbles up and exits
      // the app instead of hopping there.
      backBehavior="none"
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>{t('tabs.listings')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet" md="list" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('tabs.map')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map" md="map" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
