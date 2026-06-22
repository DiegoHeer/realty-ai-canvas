import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';

import { SettingsOptionsScreen } from '@/components/settings-options-screen';
import { useAppearance, type Appearance } from '@/lib/appearance';
import { APPEARANCE_OPTIONS } from '@/lib/settings-options';

/**
 * Full-screen appearance picker (pushed from the profile screen). Selecting an
 * option applies it immediately and navigates back.
 */
export default function AppearanceSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { appearance, setAppearance } = useAppearance();

  return (
    <SettingsOptionsScreen
      options={APPEARANCE_OPTIONS.map((option) => ({
        key: option.value,
        label: `${option.emoji} ${t(option.labelKey)}`,
      }))}
      selectedKey={appearance}
      onSelect={(key) => {
        setAppearance(key as Appearance);
        // Defer the pop to the next frame: changing the appearance swaps the
        // theme (a global re-render); applying + popping in the same frame races
        // react-native-screens' transition draw and crashes Android with
        // "trying to use a recycled bitmap". One frame of separation lets the
        // re-render commit before the pop animation starts.
        requestAnimationFrame(() => router.back());
      }}
    />
  );
}
