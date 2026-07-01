import { useCityNames } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type ScrollView,
} from 'react-native';
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

/** How long a page must sit idle before the swipe-hint nudge plays. */
const PEEK_DELAY_MS = 7000;
/** How far the pages slide over to let the next page peek in. */
const PEEK_DISTANCE = 56;
/** Taps closer together than this collapse into one page flip. */
const TAP_THROTTLE_MS = 350;

// Web only: marks each page cell so global.css can put scroll-snap-stop on its
// snap wrapper — the CSS equivalent of `disableIntervalMomentum`
// (react-native-web has no momentum to disable, but browsers honour
// scroll-snap-stop, and RNW strips it from inline styles).
const webSnapStopMarker =
  Platform.OS === 'web' ? ({ dataSet: { pagesnap: 'always' } } as Record<string, unknown>) : null;

/** Compact euro label for the price summary: €1450 / €675k / €1.2M. */
function compactEuro(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 10_000) return `€${Math.round(v / 1000)}k`;
  return `€${v}`;
}

/**
 * The intro tour: five pages laid out side-by-side in one horizontal, paging
 * ScrollView, a "Skip tour" shortcut on top, and a bottom bar holding Back and
 * the progress dots. The user moves through the tour by swiping (each page
 * anchors into place via `pagingEnabled`, and one swipe never skips past the
 * adjacent page) or by tapping the left/right edge of a page — there is no
 * per-page Continue; the last page carries the single finishing action. The
 * dots track the live scroll position, so they morph mid-swipe; each page's
 * content fades up in step with how much of the page is scrolled into view,
 * and a page left idle briefly nudges sideways to hint at swiping. The
 * user's buy/rent + price choices and selected cities are staged locally and
 * only applied on finish — committing the filters to the live store and asking
 * the map to focus the first city — so nothing changes under the user mid-tour.
 * Skipping (or finishing) marks the tour done so it never auto-shows again.
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

  // Pager geometry, measured by onLayout. Deliberately starts at 0 — the same
  // value the static web export renders on the server — so hydration matches
  // and the 0 → real-width state change re-renders (and actually patches) the
  // cells. Seeding from Dimensions here breaks the exported site: the client
  // state then equals what onLayout measures, React bails out, and the
  // server's width-0 markup stays on screen forever.
  const [pageWidth, setPageWidth] = useState(0);
  const pageWidthRef = useRef(pageWidth);
  useEffect(() => {
    pageWidthRef.current = pageWidth;
  }, [pageWidth]);
  // For gesture math before onLayout has fired (and in Jest, where layout
  // events never fire), fall back to the window width.
  const pagerWidth = useCallback(
    () => pageWidthRef.current || Dimensions.get('window').width || 1,
    [],
  );

  // Live scroll offset, and the same value in page units (offset / page width)
  // for the progress dots to interpolate against. Held in state, not refs, so
  // they're never read during render (mirrors components/range-slider.tsx).
  const scrollRef = useRef<ScrollView>(null);
  const [scrollX] = useState(() => new Animated.Value(0));
  const [pageWidthAnim] = useState(() => new Animated.Value(Math.max(1, pageWidth)));
  useEffect(() => {
    pageWidthAnim.setValue(Math.max(1, pageWidth));
  }, [pageWidth, pageWidthAnim]);
  const progress = useMemo(() => Animated.divide(scrollX, pageWidthAnim), [scrollX, pageWidthAnim]);

  // A thumb drag on the price slider must not also drag the pager sideways.
  const [pagerEnabled, setPagerEnabled] = useState(true);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(PAGE_COUNT - 1, next));
      indexRef.current = clamped; // sync now — the effect above lags a render
      setIndex(clamped);
      setOnboardingPage(clamped);
      scrollRef.current?.scrollTo({ x: clamped * pagerWidth(), animated: true });
    },
    [setOnboardingPage, pagerWidth],
  );

  // Track which page a swipe lands on. Only offsets *at rest on a page anchor*
  // count — mid-flight values (button animations, momentum) are ignored, so
  // `index` can't flicker while a scroll is in motion. Settling is detectable
  // without a momentum-end event (react-native-web has none): the native pager
  // and CSS snap both always come to rest exactly on an anchor.
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => {
      const width = pagerWidth();
      const nearest = Math.max(0, Math.min(PAGE_COUNT - 1, Math.round(value / width)));
      if (Math.abs(value - nearest * width) > 2) return; // still in motion
      if (nearest !== indexRef.current) {
        indexRef.current = nearest;
        setIndex(nearest);
        setOnboardingPage(nearest);
      }
    });
    return () => scrollX.removeListener(id);
  }, [scrollX, setOnboardingPage, pagerWidth]);

  // Idle swipe hint: 7 s after landing on a page (bar the last), slide the
  // pages over so the next one peeks in, then spring back. The nudge is a
  // translateX on the page cells — not a scroll — so it can't disturb the
  // scroll position or the settle tracking above. One nudge per page visit;
  // touching the pager (or starting a slider drag) cancels it.
  const [peekX] = useState(() => new Animated.Value(0));
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPeek = useCallback(() => {
    if (peekTimer.current !== null) {
      clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    // Snap straight back rather than animating: this also runs as effect
    // cleanup on unmount, where starting a new animation would throw.
    peekX.stopAnimation();
    peekX.setValue(0);
  }, [peekX]);
  useEffect(() => {
    if (index >= PAGE_COUNT - 1) return; // nothing to peek at past the last page
    peekTimer.current = setTimeout(() => {
      peekTimer.current = null;
      // JS driver (also on native): peekX feeds the entranceProgress graph
      // below alongside the JS-driven scrollX, and a native-driven value
      // wouldn't update its JS-side consumers mid-animation.
      Animated.sequence([
        Animated.timing(peekX, {
          toValue: -PEEK_DISTANCE,
          duration: 320,
          useNativeDriver: false,
        }),
        Animated.delay(140),
        Animated.spring(peekX, {
          toValue: 0,
          friction: 6,
          useNativeDriver: false,
        }),
      ]).start();
    }, PEEK_DELAY_MS);
    return cancelPeek;
  }, [index, peekX, cancelPeek]);

  // Float-in tied to the scroll, not to arrival: each page's content fades up
  // (opacity + a small translateY) in proportion to how much of the page is in
  // view, so a swipe reveals it progressively and scrubbing back and forth
  // scrubs the animation too. The basis subtracts the peek offset (peekX is
  // negative while nudging), so the sliver the idle hint exposes also fades in
  // as it comes into view. Pure interpolation — no timers, nothing to cancel.
  const entranceProgress = useMemo(
    () => Animated.divide(Animated.subtract(scrollX, peekX), pageWidthAnim),
    [scrollX, peekX, pageWidthAnim],
  );

  // Story-style tap navigation: a tap on the left/right third of a page flips
  // one page back/forward. The tap zone sits *behind* the page content —
  // buttons, pills, inputs and the slider claim their touches first, so only
  // taps on passive areas navigate. Taps are throttled so a burst (an eager
  // double-tap, or web dispatching pointer+click for one gesture) can never
  // flip more than one page.
  const lastTapAt = useRef(0);
  const onPageTap = useCallback(
    (e: GestureResponderEvent) => {
      const now = Date.now();
      if (now - lastTapAt.current < TAP_THROTTLE_MS) return;
      // Web only: a click on an interactive element (the city search input, a
      // slider thumb, a role-less pressable like the search-clear ✕) bubbles
      // to this handler even though the responder path excludes it on native —
      // walk the DOM path and skip anything interactive between the click
      // target and the page cell. Interactive means a form control tag, an
      // actionable ARIA role, or an *explicit* tabindex — the tabIndex
      // property is useless here because Chrome reflects 0 for any scrollable
      // container (the page body itself).
      if (Platform.OS === 'web') {
        const INTERACTIVE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'];
        const INTERACTIVE_ROLES = ['button', 'slider', 'link', 'textbox', 'checkbox', 'switch'];
        let node = e.target as unknown as HTMLElement | null;
        const root = e.currentTarget as unknown as HTMLElement;
        while (node && node !== root && typeof node.tagName === 'string') {
          const role = node.getAttribute?.('role');
          if (
            INTERACTIVE_TAGS.includes(node.tagName) ||
            (role != null && INTERACTIVE_ROLES.includes(role)) ||
            (node.hasAttribute?.('tabindex') && node.tabIndex >= 0)
          ) {
            return;
          }
          node = node.parentElement;
        }
      }
      const width = pagerWidth();
      // Some web press paths deliver coordinates on changedTouches instead.
      const x = e.nativeEvent.pageX ?? e.nativeEvent.changedTouches?.[0]?.pageX;
      if (typeof x !== 'number') return;
      // Only navigate (and arm the throttle) when there's somewhere to go.
      if (x < width / 3 && indexRef.current > 0) {
        lastTapAt.current = now;
        goTo(indexRef.current - 1);
      } else if (x > (width * 2) / 3 && indexRef.current < PAGE_COUNT - 1) {
        lastTapAt.current = now;
        goTo(indexRef.current + 1);
      }
    },
    [goTo, pagerWidth],
  );

  // Park the pager on the current page whenever the page width changes: places
  // the resume page once the first layout lands and keeps the offset in sync
  // across web resizes / device rotation (offsets scale with width).
  useEffect(() => {
    if (pageWidth <= 0) return; // not measured yet
    scrollRef.current?.scrollTo({ x: indexRef.current * pageWidth, animated: false });
  }, [pageWidth]);

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
            cancelPeek();
            setPagerEnabled(false);
            // A grab of a thumb also emits a click on web — swallow it so
            // fiddling with the slider can't tap-navigate the pager.
            lastTapAt.current = Date.now();
          }}
          onDragEnd={() => {
            setPagerEnabled(true);
            lastTapAt.current = Date.now();
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
        <View className="gap-3">
          <View className="items-center rounded-2xl bg-blue-50 p-4 dark:bg-blue-950">
            <Text className="text-base font-medium text-blue-700 dark:text-blue-300">
              {t('onboarding.account.signedInAs', { name: user.name })}
            </Text>
          </View>
          <PrimaryButton
            testID="onboarding-get-started"
            label={t('onboarding.getStarted')}
            onPress={finish}
          />
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
          <Pressable
            testID="onboarding-get-started"
            onPress={finish}
            accessibilityRole="button"
            className="items-center py-3.5 active:opacity-60">
            <Text className="text-base font-medium text-neutral-500 dark:text-neutral-400">
              {t('onboarding.account.getStartedWithoutAccount')}
            </Text>
          </Pressable>
        </View>
      )}
    </OnboardingPage>,
  ];

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        {/* Top bar: just the persistent "Skip tour". */}
        <View className="h-12 flex-row items-center justify-end px-4">
          <TextButton testID="skip-tour" label={t('onboarding.skipTour')} onPress={skip} />
        </View>

        {/* The pager: all pages side-by-side, one viewport wide each, snapping
            page-by-page. Swipes and the Back/Continue buttons drive the same
            scroll position. */}
        <View
          className="flex-1"
          onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}>
          <Animated.ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            horizontal
            pagingEnabled
            // A single fling stops at the adjacent page instead of skipping
            // ahead (iOS/Android; the web pendant is `webSnapStop` per cell).
            disableIntervalMomentum
            scrollEnabled={pagerEnabled}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
              useNativeDriver: false,
            })}
            onTouchStart={cancelPeek}
            onScrollBeginDrag={cancelPeek}>
            {pages.map((page, i) => (
              <Animated.View
                key={i}
                {...webSnapStopMarker}
                // height 100%: on web the cell sits inside RNW's stretched
                // snap wrapper and would otherwise collapse to its content's
                // height, leaving the tap zones covering only part of the page.
                style={{ width: pageWidth, height: '100%', transform: [{ translateX: peekX }] }}>
                <Pressable
                  testID={`onboarding-page-${i}`}
                  accessible={false}
                  onPress={onPageTap}
                  style={{ flex: 1 }}>
                  <Animated.View
                    style={{
                      flex: 1,
                      opacity: entranceProgress.interpolate({
                        inputRange: [i - 1, i, i + 1],
                        outputRange: [0, 1, 0],
                        extrapolate: 'clamp',
                      }),
                      transform: [
                        {
                          translateY: entranceProgress.interpolate({
                            inputRange: [i - 1, i, i + 1],
                            outputRange: [24, 0, 24],
                            extrapolate: 'clamp',
                          }),
                        },
                      ],
                    }}>
                    {page}
                  </Animated.View>
                </Pressable>
              </Animated.View>
            ))}
          </Animated.ScrollView>
        </View>

        {/* Bottom bar: Back (after the first page) on the left with the
            progress dots centred. Pages advance by swiping or edge-tapping;
            the last page carries the single finishing action. */}
        <View className="h-16 flex-row items-center px-4">
          <View className="flex-1 items-start">
            {index > 0 ? (
              <TextButton
                testID="onboarding-back"
                label={t('onboarding.back')}
                onPress={() => goTo(index - 1)}
              />
            ) : null}
          </View>
          <ProgressDots
            count={PAGE_COUNT}
            progress={progress}
            label={t('onboarding.stepOf', { current: index + 1, total: PAGE_COUNT })}
          />
          <View className="flex-1" />
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
