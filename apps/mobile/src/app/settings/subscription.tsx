import { useTranslation } from '@realty/i18n';

import { ComingSoon } from '@/components/settings-content';

/**
 * Subscription page (pushed from the profile screen). Placeholder until billing
 * is built — replaces the former "Payment methods" row.
 */
export default function SubscriptionSettingsScreen() {
  const { t } = useTranslation();
  return <ComingSoon message={t('subscriptionPage.comingSoon')} />;
}
