import { useTranslation } from '@realty/i18n';
import { Pressable, ScrollView, Text } from 'react-native';

// Dummy filter categories for now — labels live in i18n under `filters.*`.
const FILTERS = [
  'favorites',
  'shops',
  'hotspots',
  'noise',
  'airQuality',
  'restaurants',
  'parks',
] as const;

/**
 * Horizontal, scrollable row of filter pills shown under the search bar. The
 * pills are placeholders for now (no behavior wired up) but read their labels
 * from i18n so they're translation-ready.
 */
export function FilterPills() {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
      {FILTERS.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          className="rounded-full bg-white px-4 py-2 shadow-md shadow-black/20 active:bg-neutral-100 dark:bg-neutral-800 dark:active:bg-neutral-700">
          <Text className="text-lg font-medium text-neutral-900 dark:text-white">
            {t(`filters.${key}`)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
