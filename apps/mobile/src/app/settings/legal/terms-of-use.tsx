import { useTranslation } from '@realty/i18n';
import { Text } from 'react-native';

import { InfoCard, Paragraph, SettingsContentScreen } from '@/components/settings-content';

// Section ids, each mapping to `termsOfUsePage.sections.<id>.title` / `.body`
// in the locale files. Add an id here and the matching keys to add a section.
const SECTION_IDS = [
  'whatIsHuismus',
  'eligibility',
  'accountSecurity',
  'acceptableUse',
  'listingDataDisclaimer',
  'availability',
  'subscriptions',
  'intellectualProperty',
  'liability',
  'termination',
  'changes',
  'governingLaw',
  'otherProvisions',
  'contact',
] as const;

/** Full Terms of Use (pushed from the profile screen's Support section). */
export default function TermsOfUseScreen() {
  const { t } = useTranslation();

  return (
    <SettingsContentScreen>
      <Text className="px-1 text-sm text-neutral-500">{t('termsOfUsePage.lastUpdated')}</Text>

      <InfoCard>
        <Paragraph>{t('termsOfUsePage.intro')}</Paragraph>
      </InfoCard>

      {SECTION_IDS.map((id) => (
        <InfoCard key={id} title={t(`termsOfUsePage.sections.${id}.title`)}>
          <Paragraph>{t(`termsOfUsePage.sections.${id}.body`)}</Paragraph>
        </InfoCard>
      ))}
    </SettingsContentScreen>
  );
}
