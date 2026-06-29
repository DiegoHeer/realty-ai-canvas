import type { CityName } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { SelectPills } from '@/components/filter-controls';
import { useEffectiveColorScheme } from '@/components/map-style';
import { BuildingsGlyph, OnboardingHeader, OnboardingPage } from '@/components/onboarding/shared';
import { biggestCities, cityDisplayName, searchCities } from '@/lib/city-search';

/** Neutral placeholder grey that reads on both light and dark inputs. */
const PLACEHOLDER_COLOR = '#9ca3af';

/**
 * Tour step 4: pick the cities to search in. Shows the ten largest cities as
 * multi-select pills by default; typing in the search field fuzzy-matches the
 * full municipality list (from `/v1/cities`) and lets the user toggle any of
 * them. Selection state is owned by the flow so it survives swiping between
 * pages; this component is otherwise stateless apart from the query text.
 */
export function CitiesPage({
  cities,
  loading,
  selectedCodes,
  onToggle,
}: {
  cities: CityName[];
  loading: boolean;
  selectedCodes: string[];
  onToggle: (code: string) => void;
}) {
  const { t } = useTranslation();
  const isDark = useEffectiveColorScheme() === 'dark';
  const [query, setQuery] = useState('');

  const selected = useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const results = useMemo(() => searchCities(query, cities), [query, cities]);

  // Pills = the ten biggest, plus any already-selected city (e.g. picked via
  // search) that isn't already among them, so the full selection stays visible.
  const pillCities = useMemo(() => {
    const popular = biggestCities(cities);
    const popularCodes = new Set(popular.map((c) => c.code));
    const extras = cities.filter((c) => selected.has(c.code) && !popularCodes.has(c.code));
    return [...popular, ...extras];
  }, [cities, selected]);

  const searching = query.trim().length > 0;

  return (
    <OnboardingPage>
      <OnboardingHeader
        icon={<BuildingsGlyph />}
        title={t('onboarding.cities.title')}
        subtitle={t('onboarding.cities.subtitle')}
      />

      <View
        className="flex-row items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 dark:border-neutral-700 dark:bg-neutral-900"
        style={{ paddingVertical: 2 }}>
        <Text className="text-base text-neutral-400">⌕</Text>
        <TextInput
          testID="city-search-input"
          value={query}
          onChangeText={setQuery}
          placeholder={t('onboarding.cities.searchPlaceholder')}
          placeholderTextColor={PLACEHOLDER_COLOR}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t('onboarding.cities.searchPlaceholder')}
          className="flex-1 py-3 text-base text-neutral-900 dark:text-white"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="clear">
            <Text className="px-1 text-lg text-neutral-400">✕</Text>
          </Pressable>
        ) : null}
      </View>

      {loading && cities.length === 0 ? (
        <ActivityIndicator className="mt-2" />
      ) : searching ? (
        <View className="gap-1">
          {results.length === 0 ? (
            <Text className="py-3 text-base text-neutral-500">
              {t('onboarding.cities.noResults')}
            </Text>
          ) : (
            results.map((city) => {
              const isSelected = selected.has(city.code);
              return (
                <Pressable
                  key={city.code}
                  testID={`city-result-${city.code}`}
                  onPress={() => onToggle(city.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className="flex-row items-center justify-between rounded-xl px-3 py-3 active:opacity-70">
                  <Text
                    className={
                      isSelected
                        ? 'text-base font-semibold text-blue-600 dark:text-blue-400'
                        : 'text-base text-neutral-900 dark:text-white'
                    }>
                    {cityDisplayName(city)}
                  </Text>
                  {isSelected ? <Text className="text-base text-blue-600">✓</Text> : null}
                </Pressable>
              );
            })
          )}
        </View>
      ) : (
        <View className="gap-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t('onboarding.cities.popular')}
          </Text>
          <SelectPills
            options={pillCities.map((c) => ({ key: c.code, label: cityDisplayName(c) }))}
            selected={selectedCodes}
            onToggle={onToggle}
          />
        </View>
      )}

      {selectedCodes.length > 0 ? (
        <Text className="text-center text-sm text-neutral-500" style={{ color: isDark ? '#a1a1aa' : '#6b7280' }}>
          {t('onboarding.cities.selectedCount', { count: selectedCodes.length })}
        </Text>
      ) : null}
    </OnboardingPage>
  );
}
