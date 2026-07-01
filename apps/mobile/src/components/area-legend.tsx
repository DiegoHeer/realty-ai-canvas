import { useTranslation } from '@realty/i18n';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const TRACK_H = 12;
// Keeps the floating value pill clear of the track ends so it never spills out
// of the card. Sized for a half a typical (≤5-digit, grouped) inhabitant count.
const PILL_HALF = 30;
// How the marker travels to the new spot when the selected value changes.
const MARKER_ANIM = { duration: 500, easing: Easing.out(Easing.ease) };
// The pill's count-up runs in step with the marker's travel.
const COUNT_MS = 500;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/**
 * The number shown in the value pill, eased from the previously displayed
 * number to `value` (stat-counter style) in step with the marker's travel.
 * Snaps when the marker (re)appears — there's no on-screen number to count
 * from — and retargets mid-count from the number currently showing.
 */
function useCountUp(value: number | null): number | null {
  const [display, setDisplay] = useState(value);
  // The number currently rendered, so a retarget mid-count starts from what's
  // on screen rather than from the previous target.
  const shownRef = useRef(value);
  // Adjust-state-on-prop-change (render-time, per the React docs pattern):
  // snap the display when the value appears from / disappears to null.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (prevValue == null || value == null) setDisplay(value);
  }
  useEffect(() => {
    const from = shownRef.current;
    shownRef.current = value;
    if (value == null || from == null || from === value) return;
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / COUNT_MS);
      const shown = Math.round(from + (value - from) * easeOut(p));
      shownRef.current = shown;
      setDisplay(shown);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return value == null ? null : display;
}

export interface AreaLegendData {
  /** Lowest value across the municipality — the light end of the ramp. */
  min: number;
  /** Highest value across the municipality — the dark end of the ramp. */
  max: number;
  /** The selected neighborhood's value, or null when it's suppressed/missing. */
  value: number | null;
  /** Gradient stops, low→high, matching the map's choropleth ramp. */
  ramp: string[];
}

/**
 * Compact scale legend for the neighborhood choropleth: a light→dark blue
 * gradient spanning the municipality's min→max inhabitant count, with a marker
 * pinning where the selected neighborhood falls and its value floating above.
 * Built from the same ramp + domain the map shades with, so it explains the
 * fill rather than approximating it. Selecting another neighborhood eases the
 * marker to its new position rather than jumping.
 */
export function AreaLegend({ min, max, value, ramp }: AreaLegendData) {
  const { t, i18n } = useTranslation();
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  // Track width drives the marker's pixel position; measured once it lays out.
  const [trackW, setTrackW] = useState(0);
  const displayValue = useCountUp(value);

  const span = max - min;
  // Normalised position of the selected value on the ramp, clamped to [0, 1].
  // Null (no marker) when the value is missing or the domain has no spread.
  const t01 = value == null || span <= 0 ? null : Math.min(1, Math.max(0, (value - min) / span));
  const showMarker = t01 != null && trackW > 0;
  const markerX = t01 == null ? 0 : t01 * trackW;

  // Marker position along the track, in pixels. A value change while the marker
  // is visible eases it over; a (re)appearance or track resize places it
  // instantly. Layout effect so the snap lands before the frame paints.
  const animX = useSharedValue(0);
  const prevRef = useRef<{ x: number; trackW: number } | null>(null);
  useLayoutEffect(() => {
    if (!showMarker) {
      prevRef.current = null;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = { x: markerX, trackW };
    if (prev == null || prev.trackW !== trackW) {
      animX.value = markerX;
    } else if (prev.x !== markerX) {
      animX.value = withTiming(markerX, MARKER_ANIM);
    }
  }, [animX, showMarker, markerX, trackW]);

  // Animated `left` for the pill and the marker line, with the same clamps the
  // static layout used: the pill stays clear of the track ends, the line stays
  // within the track.
  const pillStyle = useAnimatedStyle(() => ({
    left: Math.min(Math.max(animX.value, PILL_HALF), Math.max(PILL_HALF, trackW - PILL_HALF)),
  }));
  const lineStyle = useAnimatedStyle(() => ({
    left: Math.min(Math.max(animX.value - 1.5, 0), Math.max(0, trackW - 3)),
  }));

  return (
    // Transparent — it floats directly over the map above the sheet. `items-center`
    // centers the scale group.
    <View className="items-center pb-2 pt-2">
      {/* Centered, 40%-wide scale group — the value pill, gradient track and the
          min/max labels all share this width so they line up. */}
      <View className="w-2/5">
        {/* Reserved row above the track for the floating value pill. */}
        <View className="h-6 justify-end">
          {showMarker ? (
            <Animated.View style={[styles.pillAnchor, pillStyle]}>
              {/* -50% shifts the pill so it centers on the anchored point. */}
              <View
                className="rounded-full bg-white px-2 py-0.5 dark:bg-neutral-800"
                style={styles.centerOnAnchor}>
                <Text className="text-[11px] font-bold text-neutral-900 dark:text-white">
                  {nf.format(displayValue!)}
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </View>

        {/* Gradient track + value marker. A black (light) / white (dark) border
            sets the bar off against the map and the pale end of the ramp. */}
        <View
          className="rounded-full border border-black dark:border-white"
          onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
          style={styles.track}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="areaLegendRamp" x1="0" y1="0" x2="1" y2="0">
                {ramp.map((color, i) => (
                  <Stop
                    key={`${color}-${i}`}
                    offset={ramp.length > 1 ? i / (ramp.length - 1) : 0}
                    stopColor={color}
                  />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" rx={TRACK_H / 2} fill="url(#areaLegendRamp)" />
          </Svg>
          {showMarker ? (
            <Animated.View style={[styles.markerLine, lineStyle]}>
              {/* White core + dark edge so the line reads on both ends of the ramp. */}
              <View className="flex-1 rounded-full border-x border-neutral-900/50 bg-white" />
            </Animated.View>
          ) : null}
        </View>

        {/* Scale row: min at the left end, the legend label centered between,
            max at the right end — all on one line. */}
        <View className="mt-1 flex-row items-center justify-between">
          <Text className="text-[10px] font-medium text-neutral-900 dark:text-neutral-100">
            {nf.format(min)}
          </Text>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
            {t('area.stats.inhabitants')}
          </Text>
          <Text className="text-[10px] font-medium text-neutral-900 dark:text-neutral-100">
            {nf.format(max)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_H,
    position: 'relative',
  },
  // Zero-anchor the animated wrappers; visual styling stays on the inner views
  // (className doesn't reach reanimated components).
  pillAnchor: {
    position: 'absolute',
  },
  centerOnAnchor: {
    transform: [{ translateX: '-50%' }],
  },
  markerLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
  },
});
