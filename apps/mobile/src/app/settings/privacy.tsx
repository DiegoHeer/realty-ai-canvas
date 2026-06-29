import { useTranslation } from '@realty/i18n';

import { InfoCard, Paragraph, SettingsContentScreen } from '@/components/settings-content';

/**
 * Privacy & security page (pushed from the profile screen). Static copy that
 * spells out the zero-data stance: no user data collected, only anonymous
 * in-app usage measured, and search/preferences never collected or resold.
 */
export default function PrivacySettingsScreen() {
  const { t } = useTranslation();

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
    </SettingsContentScreen>
  );
}
