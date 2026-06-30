import { supportedLanguages, useTranslation, type SupportedLanguage } from '@realty/i18n';
import { useRouter } from 'expo-router';

import { SettingsOptionsScreen } from '@/components/settings-options-screen';
import { deferNavigation } from '@/lib/navigation';
import { activeLanguage, LANGUAGE_LABELS } from '@/lib/settings-options';

/**
 * Full-screen language picker (pushed from the profile screen). Selecting a
 * language applies it immediately and navigates back.
 */
export default function LanguageSettingsScreen() {
  const { i18n } = useTranslation();
  const router = useRouter();

  return (
    <SettingsOptionsScreen
      options={supportedLanguages.map((lng) => ({ key: lng, label: LANGUAGE_LABELS[lng] }))}
      selectedKey={activeLanguage(i18n)}
      onSelect={(key) => {
        void i18n.changeLanguage(key as SupportedLanguage);
        // Defer the pop to the next frame: applying a global change (re-renders
        // every translated screen) and popping in the same frame races
        // react-native-screens' transition draw and crashes Android with
        // "trying to use a recycled bitmap". One frame of separation lets the
        // re-render commit before the pop animation starts.
        deferNavigation(() => router.back());
      }}
    />
  );
}
