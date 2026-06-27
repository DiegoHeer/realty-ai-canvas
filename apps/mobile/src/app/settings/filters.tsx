import { useListings } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import type { BuildingType } from '@realty/types';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterSection, SelectPills, Stepper } from '@/components/filter-controls';
import { RangeSlider } from '@/components/range-slider';
import {
  AREA_DOMAIN,
  applyFilters,
  BUILDING_TYPES,
  DEFAULT_FILTERS,
  ENERGY_LABELS,
  PRICE_DISTRIBUTION_BUY,
  PRICE_DISTRIBUTION_RENT,
  priceDomain,
  useFilters,
  YEAR_DOMAIN,
  type Filters,
  type ListingMode,
} from '@/lib/filters';

// Compact euro label for the section summaries: €1450 / €675k / €1.2M.
function compactEuro(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 10_000) return `€${Math.round(v / 1000)}k`;
  return `€${v}`;
}

/**
 * Full-screen search filters, pushed from the search bar's filters button.
 * Edits stage in a local `draft`; "Show homes" commits the draft to the shared
 * filter store and pops back, "Reset" (header) clears the draft. The store then
 * drives both the map's visible listings and the search bar's count badge.
 */
export default function FiltersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { filters, setFilters } = useFilters();
  const { data: listings = [] } = useListings();

  // Stage edits locally; nothing affects the map until "Show homes".
  const [draft, setDraft] = useState<Filters>(filters);
  const update = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  // iOS reads a left-to-right thumb drag as the screen's back-swipe (most sliders
  // sit at their minimum, hard against the left edge). Suspend the pop gesture for
  // the duration of any thumb drag, then restore it. Spread onto every slider.
  const setSwipeBack = useCallback(
    (enabled: boolean) => navigation.setOptions({ gestureEnabled: enabled }),
    [navigation],
  );
  const sliderDrag = {
    onDragStart: () => setSwipeBack(false),
    onDragEnd: () => setSwipeBack(true),
  };

  // Reset lives in the native header, mirroring the pushed settings screens.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => setDraft(DEFAULT_FILTERS)} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: '#2563eb' }} className="text-base font-semibold">
            {t('filtersPage.reset')}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, t]);

  const matchCount = applyFilters(listings, draft).length;
  const anyLabel = t('filtersPage.any');

  // Bedrooms/bathrooms render as discrete 0–6 sliders; 0 reads as "Any", n as "+n".
  const roomCountLabel = (v: number) => (v === 0 ? anyLabel : `+${v}`);

  // Price — domain (and the availability histogram) depend on buy vs. rent.
  const price = priceDomain(draft.mode);
  const priceValues = [draft.minPrice ?? price.min, draft.maxPrice ?? price.max];
  const priceLabel =
    draft.minPrice === null && draft.maxPrice === null
      ? anyLabel
      : `${compactEuro(priceValues[0])} – ${compactEuro(priceValues[1])}`;

  const areaValues = [draft.minAreaSqm ?? AREA_DOMAIN.min, draft.maxAreaSqm ?? AREA_DOMAIN.max];
  const areaLabel =
    draft.minAreaSqm === null && draft.maxAreaSqm === null
      ? anyLabel
      : `${areaValues[0]} – ${areaValues[1]} m²`;

  // Energy labels are a free multi-select; summarise them in canonical (best→worst)
  // order regardless of the order they were toggled in.
  const energyLabelSummary =
    draft.energyLabels.length > 0
      ? ENERGY_LABELS.filter((l) => draft.energyLabels.includes(l)).join(', ')
      : anyLabel;

  function apply() {
    setFilters(draft);
    // Defer the pop one frame: committing filters re-renders the map (which
    // draws listing imagery) and popping in the same frame races
    // react-native-screens' transition and crashes Android with "recycled
    // bitmap". Mirrors app/settings/language.tsx.
    requestAnimationFrame(() => router.back());
  }

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-black">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <FilterSection title={t('filtersPage.mode')}>
          <SelectPills
            stretch
            // Rent is a placeholder until the backend supports it (deal_type=rent);
            // keep it visible but disabled so Buy stays the only, selected option.
            disabledKeys={['rent']}
            options={[
              { key: 'buy', label: t('filtersPage.buy') },
              { key: 'rent', label: t('filtersPage.rent') },
            ]}
            selected={[draft.mode]}
            onToggle={(key) => update({ mode: key as ListingMode, minPrice: null, maxPrice: null })}
          />
        </FilterSection>

        <FilterSection title={t('filtersPage.price')} value={priceLabel}>
          <RangeSlider
            min={price.min}
            max={price.max}
            step={price.step}
            values={priceValues}
            distribution={draft.mode === 'rent' ? PRICE_DISTRIBUTION_RENT : PRICE_DISTRIBUTION_BUY}
            onChange={([lo, hi]) =>
              update({
                minPrice: lo <= price.min ? null : lo,
                maxPrice: hi >= price.max ? null : hi,
              })
            }
            {...sliderDrag}
          />
        </FilterSection>

        <FilterSection title={t('filtersPage.propertyType')}>
          <SelectPills
            options={BUILDING_TYPES.map((key) => ({
              key,
              label: t(`filtersPage.buildingTypes.${key}` as const),
            }))}
            selected={draft.propertyTypes}
            onToggle={(key) =>
              update({
                propertyTypes: draft.propertyTypes.includes(key as BuildingType)
                  ? draft.propertyTypes.filter((x) => x !== key)
                  : [...draft.propertyTypes, key as BuildingType],
              })
            }
          />
        </FilterSection>

        <FilterSection title={t('filtersPage.bedrooms')} value={roomCountLabel(draft.minBedrooms)}>
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <RangeSlider
                min={0}
                max={6}
                step={1}
                values={[draft.minBedrooms]}
                onChange={([v]) => update({ minBedrooms: v })}
                {...sliderDrag}
              />
            </View>
            <Stepper
              buttonsOnly
              value={draft.minBedrooms}
              min={0}
              max={6}
              onChange={(v) => update({ minBedrooms: v })}
            />
          </View>
        </FilterSection>

        <FilterSection title={t('filtersPage.bathrooms')} value={roomCountLabel(draft.minBathrooms)}>
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <RangeSlider
                min={0}
                max={6}
                step={1}
                values={[draft.minBathrooms]}
                onChange={([v]) => update({ minBathrooms: v })}
                {...sliderDrag}
              />
            </View>
            <Stepper
              buttonsOnly
              value={draft.minBathrooms}
              min={0}
              max={6}
              onChange={(v) => update({ minBathrooms: v })}
            />
          </View>
        </FilterSection>

        <FilterSection title={t('filtersPage.size')} value={areaLabel}>
          <RangeSlider
            min={AREA_DOMAIN.min}
            max={AREA_DOMAIN.max}
            step={AREA_DOMAIN.step}
            values={areaValues}
            onChange={([lo, hi]) =>
              update({
                minAreaSqm: lo <= AREA_DOMAIN.min ? null : lo,
                maxAreaSqm: hi >= AREA_DOMAIN.max ? null : hi,
              })
            }
            {...sliderDrag}
          />
        </FilterSection>

        <FilterSection title={t('filtersPage.energyLabel')} value={energyLabelSummary}>
          <SelectPills
            options={ENERGY_LABELS.map((label) => ({ key: label, label }))}
            selected={draft.energyLabels}
            onToggle={(key) =>
              update({
                energyLabels: draft.energyLabels.includes(key)
                  ? draft.energyLabels.filter((x) => x !== key)
                  : [...draft.energyLabels, key],
              })
            }
          />
        </FilterSection>

        <FilterSection
          title={t('filtersPage.buildYear')}
          value={draft.minBuildYear === null ? anyLabel : String(draft.minBuildYear)}>
          <RangeSlider
            min={YEAR_DOMAIN.min}
            max={YEAR_DOMAIN.max}
            step={YEAR_DOMAIN.step}
            values={[draft.minBuildYear ?? YEAR_DOMAIN.min]}
            onChange={([v]) => update({ minBuildYear: v <= YEAR_DOMAIN.min ? null : v })}
            {...sliderDrag}
          />
        </FilterSection>
      </ScrollView>

      <View
        style={{ paddingBottom: insets.bottom + 12 }}
        className="border-t border-neutral-200 bg-white px-4 pt-3 dark:border-neutral-800 dark:bg-neutral-900">
        <Pressable
          onPress={apply}
          accessibilityRole="button"
          className="items-center rounded-xl bg-blue-600 py-3.5 active:opacity-80">
          <Text className="text-base font-semibold text-white">
            {t('filtersPage.showHomes', { count: matchCount })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
