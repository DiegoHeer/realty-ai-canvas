import { useTranslation } from '@realty/i18n';

import { ComingSoon } from '@/components/settings-content';

/**
 * Notifications page (pushed from the profile screen). Placeholder until
 * notification settings are built.
 */
export default function NotificationsSettingsScreen() {
  const { t } = useTranslation();
  return <ComingSoon message={t('notificationsPage.comingSoon')} />;
}
