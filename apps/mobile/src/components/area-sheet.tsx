/* eslint-disable react-hooks/immutability -- Reanimated shared values are
   mutable by design; assigning `sharedValue.value = …` (here and inside
   worklets) is the intended API, but the React Compiler rule flags it because
   the same value is also written in an effect. */
import { useTranslation } from '@realty/i18n';
import type { AreaPolygon, NeighborhoodStats } from '@realty/types';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaLegend, type AreaLegendData } from '@/components/area-legend';
import { AreaStats } from '@/components/area-stats';

const SPRING = { damping: 24, stiffness: 220, mass: 0.7 } as const;
const CLOSE_DURATION = 220;
// Gap between the legend's bottom edge and the sheet's top edge at peek.
const LEGEND_GAP = 10;

export interface AreaSheetProps {
  /** The area to show. When null the sheet is hidden. */
  area: AreaPolygon | null;
  /** Stats for `area` (matched by code). Null when none are available. */
  stats?: NeighborhoodStats | null;
  /** Municipality the area belongs to, prefixed to its name (e.g. "Den Haag · Singels"). */
  municipality?: string;
  /**
   * Choropleth scale to show above the sheet at peek (with `value` marking the
   * selected area). Null hides the legend — e.g. no spread across the municipality.
   */
  legend?: AreaLegendData | null;
  /** Called once the sheet has fully dismissed (dragged off the bottom). */
  onClose: () => void;
}

/**
 * Draggable bottom-sheet card for a selected area. Rendered as an inline,
 * absolutely-positioned overlay with `pointerEvents="box-none"` so the map stays
 * pannable/tappable everywhere the card isn't — only the card itself captures
 * touches. (This is why it's not a `Modal`: a Modal's native window would
 * intercept every touch and block the map.)
 *
 * A notch at the top hints that it can be dragged: it snaps between a "peek" and
 * a near-full-screen "expanded" state, and dragging it below the peek — or
 * pulling the content down while already scrolled to the top — drags it off
 * screen and deselects the area. Content scrolls only once expanded.
 *
 * Requires a `GestureHandlerRootView` ancestor (provided at the app root).
 */
export function AreaSheet({ area, stats, municipality, legend, onClose }: AreaSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  // translateY positions the full-height sheet: smaller = more expanded.
  const expandedY = insets.top + 8;
  const collapsedY = Math.round(screenH * 0.7);
  const offscreenY = screenH;

  const translateY = useSharedValue(offscreenY);
  const startY = useSharedValue(offscreenY);
  const scrollY = useSharedValue(0);
  // Measured legend height, so it can be anchored just above the sheet's top
  // edge. Seeded with an estimate; corrected on first layout.
  const legendH = useSharedValue(84);

  // Tracks whether the sheet is currently open, so the entrance animation can
  // tell a fresh open (closed → open) apart from switching areas (open → open).
  const isOpenRef = useRef(false);

  // Slide up from the bottom only when the sheet first opens. Picking a different
  // area while it's already open just swaps the content in place at the sheet's
  // current position — replaying the entrance animation on every switch is jarring.
  useEffect(() => {
    if (!area) {
      isOpenRef.current = false;
      return;
    }
    if (isOpenRef.current) return;
    isOpenRef.current = true;
    translateY.value = offscreenY;
    translateY.value = withSpring(collapsedY, SPRING);
    // collapsedY/offscreenY derive from screen size; re-running on area change is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Content scrolls only while (near) fully expanded; collapsed, the drag moves
  // the whole sheet. Derived on the UI thread so there's no React state to sync.
  const scrollProps = useAnimatedProps(() => {
    const atTop = translateY.value <= expandedY + 1;
    return { scrollEnabled: atTop, showsVerticalScrollIndicator: atTop };
  });

  // Lets the inner ScrollView and the sheet's pan run together.
  const nativeScroll = Gesture.Native();

  const pan = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = startY.value + e.translationY;
      // Never travel above the expanded stop.
      if (next <= expandedY) {
        translateY.value = expandedY;
        return;
      }
      // Content is scrolled down (only possible while expanded) and the user is
      // dragging down: let the list scroll back to the top first and ignore the
      // drag-to-close. Rebasing the start each frame means that the instant the
      // content reaches the top the sheet picks up the drag without a jump.
      if (scrollY.value > 0 && e.translationY > 0) {
        startY.value = translateY.value - e.translationY;
        return;
      }
      translateY.value = next;
    })
    .onEnd((e) => {
      const pos = translateY.value;
      const mid = (expandedY + collapsedY) / 2;
      if (scrollY.value > 0) {
        return
      }
      if (e.velocityY > 600 && e.velocityY < 6000 && pos < collapsedY) {
        translateY.value = withSpring(collapsedY, SPRING);
      } else if (e.velocityY > 600 || pos > collapsedY + 200) {
        // Flung or dragged well below the peek → off screen + deselect.
        translateY.value = withTiming(offscreenY, { duration: CLOSE_DURATION }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else if (e.velocityY < -600 || pos < mid) {
        translateY.value = withSpring(expandedY, SPRING);
      } else {
        translateY.value = withSpring(collapsedY, SPRING);
      }
    })
    .simultaneousWithExternalGesture(nativeScroll);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // The legend rides just above the sheet's top edge and shares its motion:
  // fully shown at peek, fading to 0 as the sheet expands toward full screen (and
  // fading back in 0→1 as it slides up from off screen, so it never flashes).
  const legendStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [expandedY/5 + collapsedY/5*4 , collapsedY, (collapsedY + offscreenY) / 2],
      [0, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateY: translateY.value - legendH.value - LEGEND_GAP }],
  }));

  if (!area) return null;

  // Prefix the neighborhood name with its municipality, e.g. "Den Haag · Singels".
  const areaName = area.name ?? t('area.unnamed');
  const title = municipality ? `${municipality} · ${areaName}` : areaName;

  return (
    // box-none: this full-screen layer never captures touches itself, so the map
    // behind it stays interactive — only the card below does. The high zIndex
    // stacks the sheet above the tab bar.
    <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, { height: screenH }, sheetStyle]}>
          <View
            className="flex-1 overflow-hidden rounded-t-3xl bg-neutral-50 dark:bg-neutral-900"
            style={styles.shadow}>
            {/* Drag notch — the affordance for pulling the sheet up/down. */}
            <View className="items-center pb-2 pt-3">
              <View className="h-1.5 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            </View>
            <GestureDetector gesture={nativeScroll}>
              <Animated.ScrollView
                style={styles.scroll}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                animatedProps={scrollProps}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingBottom: insets.bottom + 48,
                }}>
                <Text
                  className="text-2xl font-bold text-neutral-900 dark:text-white"
                  numberOfLines={1}>
                  {title}
                </Text>
                <AreaStats stats={stats} />
              </Animated.ScrollView>
            </GestureDetector>
          </View>
        </Animated.View>
      </GestureDetector>
      {legend ? (
        <Animated.View
          pointerEvents="none"
          onLayout={(e) => {
            legendH.value = e.nativeEvent.layout.height;
          }}
          style={[styles.legend, legendStyle]}>
          <AreaLegend min={legend.min} max={legend.max} value={legend.value} ramp={legend.ramp} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 1000,
    elevation: 1000,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  legend: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
  },
  scroll: {
    flex: 1,
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
});
