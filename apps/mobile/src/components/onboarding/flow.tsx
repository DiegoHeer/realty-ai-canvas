import { useCityNames } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterSection, SelectPills } from '@/components/filter-controls';
import { CitiesPage } from '@/components/onboarding/cities-page';
import {
  AccountGlyph,
  HomeGlyph,
  MapPinGlyph,
  OnboardingHeader,
  OnboardingPage,
  PrimaryButton,
  ProgressDots,
  SlidersGlyph,
  TextButton,
} from '@/components/onboarding/shared';
import { RangeSlider } from '@/components/range-slider';
import { cityDisplayName } from '@/lib/city-search';
import {
  PRICE_DISTRIBUTION_BUY,
  PRICE_DISTRIBUTION_RENT,
  priceDomain,
  useFilters,
  type ListingMode,
} from '@/lib/filters';
import { setMapFocus } from '@/lib/map-focus';
import { useOnboarding } from '@/lib/onboarding';
import { useAuth } from '@/hooks/use-auth';

const PAGE_COUNT = 5;

/** Compact euro label for the price summary: €1450 / €675k / €1.2M. */
function compactEuro(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 10_000) return `€${Math.round(v / 1000)}k`;
  return `€${v}`;
}

/**
 * The intro tour: five swipeable pages with a progress indicator, a per-page
 * Continue/Back, and a "Skip tour" shortcut. One page shows at a time; a left/
 * right swipe (PanResponder) or the Continue/Back buttons flip between them. The
 * user's buy/rent + price choices and selected cities are staged locally and only
 * applied on finish — committing
 * the filters to the live store and asking the map to focus the first city — so
 * nothing changes under the user mid-tour. Skipping (or finishing) marks the tour
 * done so it never auto-shows again.
 */
export function OnboardingFlow() {
  const { t } = useTranslation();
  const router = useRouter();
  const { lastPage, setOnboardingPage, completeOnboarding } = useOnboarding();
  const { filters, setFilters } = useFilters();
  const { isAuthenticated, user } = useAuth();
  const { data: cities = [], isLoading: citiesLoading } = useCityNames();

  // Resume where a partial run left off (the gate only routes here while pending).
  const [index, setIndex] = useState(() => Math.min(Math.max(lastPage, 0), PAGE_COUNT - 1));
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Staged filter choices (committed to the live store only on finish).
  const [mode, setMode] = useState<ListingMode>(filters.mode);
  const [price, setPrice] = useState<[number | null, number | null]>([
    filters.minPrice,
    filters.maxPrice,
  ]);
  const [cityCodes, setCityCodes] = useState<string[]>([]);
  const toggleCity = useCallback((code: string) => {
    setCityCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }, []);

  // A thumb drag on the price slider must not also page the tour sideways.
  const pagerEnabledRef = useRef(true);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(PAGE_COUNT - 1, next));
      setIndex(clamped);
      setOnboardingPage(clamped);
    },
    [setOnboardingPage],
  );
  const goToRef = useRef(goTo);
  useEffect(() => {
    goToRef.current = goTo;
  }, [goTo]);

  // Swipe paging. We render one page at a time inside a PanResponder rather than
  // a measured-width horizontal ScrollView: a left/right swipe past a threshold
  // flips the page, exactly like Back/Continue. This avoids depending on viewport
  // measurement (which hydrates as 0 on web) and keeps every page full-bleed via
  // flex. A horizontal swipe only claims the gesture when it clearly beats
  // vertical movement, so a page's own vertical scroll still works.
  //
  // The responder is built in an effect and held in state (mirrors
  // components/range-slider.tsx) so the refs it closes over are only read off the
  // render path.
  const [pan, setPan] = useState<ReturnType<typeof PanResponder.create> | null>(null);
  useEffect(() => {
    setPan(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          pagerEnabledRef.current && Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -50) goToRef.current(indexRef.current + 1);
          else if (g.dx >= 50) goToRef.current(indexRef.current - 1);
        },
      }),
    );
  }, []);

  function leaveToApp() {
    // Defer the navigation one frame: committing global state and popping the
    // screen in the same frame races react-native-screens on Android (the same
    // "recycled bitmap" guard the settings/auth screens use).
    requestAnimationFrame(() => router.replace('/'));
  }

  function finish() {
    // Apply the staged buy/rent + price onto the live filters (preserving the
    // rest), and ask the map to focus the first chosen city.
    setFilters({ ...filters, mode, minPrice: price[0], maxPrice: price[1] });
    const firstCode = cityCodes[0];
    const city = firstCode ? cities.find((c) => c.code === firstCode) : undefined;
    if (city) setMapFocus({ code: city.code, name: cityDisplayName(city) });
    completeOnboarding();
    leaveToApp();
  }

  function skip() {
    // Skipping applies nothing — just close the tour for good.
    completeOnboarding();
    leaveToApp();
  }

  // Price slider domain + summary track the (currently buy-only) mode.
  const priceCfg = priceDomain(mode);
  const priceValues = [price[0] ?? priceCfg.min, price[1] ?? priceCfg.max];
  const priceLabel =
    price[0] === null && price[1] === null
      ? t('filtersPage.any')
      : `${compactEuro(priceValues[0])} – ${compactEuro(priceValues[1])}`;

  const isLast = index === PAGE_COUNT - 1;

  const pages = [
    <OnboardingPage key="welcome">
      <OnboardingHeader
        icon={<HomeGlyph />}
        title={t('onboarding.welcome.title')}
        subtitle={t('onboarding.welcome.subtitle')}
      />
    </OnboardingPage>,

    <OnboardingPage key="features">
      <OnboardingHeader
        icon={<MapPinGlyph />}
        title={t('onboarding.features.title')}
        subtitle={t('onboarding.features.subtitle')}
      />
      <View className="gap-3">
        <FeatureCard
          icon={<MapPinGlyph size={26} />}
          title={t('onboarding.features.map.title')}
          description={t('onboarding.features.map.description')}
        />
        <FeatureCard
          icon={<SlidersGlyph size={26} />}
          title={t('onboarding.features.filters.title')}
          description={t('onboarding.features.filters.description')}
        />
      </View>
    </OnboardingPage>,

    <OnboardingPage key="filters">
      <OnboardingHeader
        icon={<SlidersGlyph />}
        title={t('onboarding.filtersStep.title')}
        subtitle={t('onboarding.filtersStep.subtitle')}
      />
      <FilterSection title={t('filtersPage.mode')}>
        <SelectPills
          stretch
          // Rent is a placeholder until the backend supports it; keep Buy the
          // only selectable option, mirroring the filters page.
          disabledKeys={['rent']}
          options={[
            { key: 'buy', label: t('filtersPage.buy') },
            { key: 'rent', label: t('filtersPage.rent') },
          ]}
          selected={[mode]}
          onToggle={(key) => {
            setMode(key as ListingMode);
            setPrice([null, null]);
          }}
        />
      </FilterSection>
      <FilterSection title={t('filtersPage.price')} value={priceLabel}>
        <RangeSlider
          min={priceCfg.min}
          max={priceCfg.max}
          step={priceCfg.step}
          values={priceValues}
          distribution={mode === 'rent' ? PRICE_DISTRIBUTION_RENT : PRICE_DISTRIBUTION_BUY}
          onChange={([lo, hi]) =>
            setPrice([lo <= priceCfg.min ? null : lo, hi >= priceCfg.max ? null : hi])
          }
          onDragStart={() => {
            pagerEnabledRef.current = false;
          }}
          onDragEnd={() => {
            pagerEnabledRef.current = true;
          }}
        />
      </FilterSection>
    </OnboardingPage>,

    <CitiesPage
      key="cities"
      cities={cities}
      loading={citiesLoading}
      selectedCodes={cityCodes}
      onToggle={toggleCity}
    />,

    <OnboardingPage key="account">
      <OnboardingHeader
        icon={<AccountGlyph />}
        title={t('onboarding.account.title')}
        subtitle={t('onboarding.account.subtitle')}
      />
      {isAuthenticated && user ? (
        <View className="items-center rounded-2xl bg-blue-50 p-4 dark:bg-blue-950">
          <Text className="text-base font-medium text-blue-700 dark:text-blue-300">
            {t('onboarding.account.signedInAs', { name: user.name })}
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          <PrimaryButton
            testID="onboarding-create-account"
            label={t('onboarding.account.createAccount')}
            onPress={() => router.push('/auth/register')}
          />
          <Pressable
            testID="onboarding-log-in"
            onPress={() => router.push('/auth/login')}
            accessibilityRole="button"
            className="items-center rounded-xl border border-neutral-300 py-3.5 active:opacity-60 dark:border-neutral-700">
            <Text className="text-base font-semibold text-neutral-900 dark:text-white">
              {t('onboarding.account.logIn')}
            </Text>
          </Pressable>
        </View>
      )}
    </OnboardingPage>,
  ];

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        {/* Top bar: centered progress dots with a persistent "Skip tour". */}
        <View className="h-12 flex-row items-center justify-between px-4">
          <View className="flex-1" />
          <ProgressDots
            count={PAGE_COUNT}
            index={index}
            label={t('onboarding.stepOf', { current: index + 1, total: PAGE_COUNT })}
          />
          <View className="flex-1 items-end">
            <TextButton testID="skip-tour" label={t('onboarding.skipTour')} onPress={skip} />
          </View>
        </View>

        <View className="flex-1" {...(pan?.panHandlers ?? {})}>
          {pages[index]}
        </View>

        {/* Bottom bar: Back (after the first page) + Continue / Get started. */}
        <View className="h-16 flex-row items-center justify-between px-4">
          {index > 0 ? (
            <TextButton
              testID="onboarding-back"
              label={t('onboarding.back')}
              onPress={() => goTo(index - 1)}
            />
          ) : (
            <View />
          )}
          <PrimaryButton
            testID="onboarding-next"
            label={isLast ? t('onboarding.getStarted') : t('onboarding.continue')}
            onPress={() => (isLast ? finish() : goTo(index + 1))}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

/** A single feature row on the "features" page: badge + title + description. */
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <View className="flex-row items-start gap-4 rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-900">
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950">
        {icon}
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold text-neutral-900 dark:text-white">{title}</Text>
        <Text className="text-sm leading-5 text-neutral-500 dark:text-neutral-400">
          {description}
        </Text>
      </View>
    </View>
  );
}
