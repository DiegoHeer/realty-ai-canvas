import { useTranslation } from '@realty/i18n';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const TRACK_H = 12;
// Keeps the floating value pill clear of the track ends so it never spills out
// of the card. Sized for a half a typical (≤5-digit, grouped) inhabitant count.
const PILL_HALF = 30;

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
 * fill rather than approximating it.
 */
export function AreaLegend({ min, max, value, ramp }: AreaLegendData) {
  const { t, i18n } = useTranslation();
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  // Track width drives the marker's pixel position; measured once it lays out.
  const [trackW, setTrackW] = useState(0);

  const span = max - min;
  // Normalised position of the selected value on the ramp, clamped to [0, 1].
  // Null (no marker) when the value is missing or the domain has no spread.
  const t01 = value == null || span <= 0 ? null : Math.min(1, Math.max(0, (value - min) / span));
  const showMarker = t01 != null && trackW > 0;
  const markerX = t01 == null ? 0 : t01 * trackW;
  const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), Math.max(lo, hi));

  return (
    // Transparent — it floats directly over the map above the sheet. `items-center`
    // centers the label and the scale group below it.
    <View className="items-center pb-2 pt-2">
      {/* Centered, 40%-wide scale group — the value pill, gradient track and the
          min/max labels all share this width so they line up. */}
      <View className="w-2/5">
        {/* Reserved row above the track for the floating value pill. */}
        <View className="h-6 justify-end">
          {showMarker ? (
            <View
              className="absolute rounded-full bg-blue-600 px-2 py-0.5"
              style={{
                left: clamp(markerX, PILL_HALF, trackW - PILL_HALF),
                transform: [{ translateX: '-50%' }],
              }}>
              <Text className="text-[11px] font-bold text-white">{nf.format(value!)}</Text>
            </View>
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
            // White core + dark edge so the line reads on both ends of the ramp.
            <View
              className="absolute bottom-0 top-0 rounded-full border-x border-neutral-900/50 bg-white"
              style={{ left: clamp(markerX - 1.5, 0, trackW - 3), width: 3 }}
            />
          ) : null}
        </View>

        <View className="mt-1 flex-row justify-between">
          <Text className="text-[10px] font-medium text-neutral-900 dark:text-neutral-100">
            {nf.format(min)}
          </Text>
          <Text className="text-[10px] font-medium text-neutral-900 dark:text-neutral-100">
            {nf.format(max)}
          </Text>
        </View>
      </View>

      {/* Title below the bar. */}
      <Text className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
        {t('area.stats.inhabitants')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_H,
    position: 'relative',
  },
});
