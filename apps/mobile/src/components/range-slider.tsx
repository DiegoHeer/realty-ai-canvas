import { useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { useEffectiveColorScheme } from '@/components/map-style';

const THUMB = 24;
const TRACK_H = 4;
const HIST_H = 44;

interface RangeSliderProps {
  min: number;
  max: number;
  step?: number;
  /** One value for a single-thumb slider, or `[lo, hi]` for a range. */
  values: number[];
  onChange: (values: number[]) => void;
  /** Optional histogram buckets drawn behind the track (e.g. availability). */
  distribution?: number[];
}

/**
 * A 1- or 2-thumb slider drawn from RN primitives + PanResponder (no native
 * slider dep, and PanResponder works on web too, so the static export renders).
 * Thumb positions are React-state-driven (the parent owns `values`); the only
 * cross-render drag state is the grab-point, kept in a reanimated shared value
 * — not a React ref, so it doesn't trip the refs-during-render lint rule and
 * stays correct across the re-renders each move triggers. An optional
 * `distribution` paints a histogram behind the track, buckets inside the
 * selected range highlighted. Value text lives in the Filters section headers.
 */
export function RangeSlider({ min, max, step = 1, values, onChange, distribution }: RangeSliderProps) {
  const isDark = useEffectiveColorScheme() === 'dark';
  const [width, setWidth] = useState(0);
  // The dragged thumb's value at gesture start; `start + dx` drives each move.
  const dragStart = useSharedValue(0);

  const trackColor = isDark ? '#404040' : '#e5e5e5';
  const activeColor = '#2563eb';
  const barColor = isDark ? '#525252' : '#d4d4d4';

  const isRange = values.length === 2;
  const xFor = (v: number) => (max === min ? 0 : ((v - min) / (max - min)) * width);

  // Recreated each render so the handlers close over the live values/width;
  // RN routes an in-flight drag to the view's current handlers, so there's no
  // staleness. `dragStart` (shared value) carries the grab-point across them.
  const responders = values.map((_v, index) =>
    PanResponder.create({
      // Grab on touch-down; only claim horizontal drags so a parent ScrollView
      // can still scroll vertically.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        dragStart.value = values[index];
      },
      onPanResponderMove: (_e, g) => {
        if (width <= 0) return;
        const delta = (g.dx / width) * (max - min);
        let next = Math.round((dragStart.value + delta) / step) * step;
        const lower = isRange && index === 1 ? values[0] : min;
        const upper = isRange && index === 0 ? values[1] : max;
        next = Math.min(upper, Math.max(lower, next));
        if (next === values[index]) return;
        const updated = [...values];
        updated[index] = next;
        onChange(updated);
      },
    }),
  );

  const maxCount = distribution && distribution.length > 0 ? Math.max(...distribution) : 0;

  return (
    <View style={{ height: (distribution ? HIST_H : 0) + THUMB, justifyContent: 'flex-end' }}>
      {distribution && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: HIST_H, gap: 2 }}>
          {distribution.map((count, i) => {
            const h = maxCount > 0 ? Math.max(2, (count / maxCount) * HIST_H) : 2;
            const mid = min + ((i + 0.5) / distribution.length) * (max - min);
            const within = isRange ? mid >= values[0] && mid <= values[1] : mid <= values[0];
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: h,
                  borderRadius: 2,
                  backgroundColor: within ? activeColor : barColor,
                }}
              />
            );
          })}
        </View>
      )}

      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: THUMB, justifyContent: 'center' }}>
        <View style={{ height: TRACK_H, borderRadius: TRACK_H / 2, backgroundColor: trackColor }} />
        {width > 0 && (
          <View
            style={{
              position: 'absolute',
              height: TRACK_H,
              borderRadius: TRACK_H / 2,
              backgroundColor: activeColor,
              left: isRange ? xFor(values[0]) : 0,
              width: isRange ? Math.max(0, xFor(values[1]) - xFor(values[0])) : xFor(values[0]),
            }}
          />
        )}
        {width > 0 &&
          values.map((v, i) => (
            <View
              key={i}
              {...responders[i].panHandlers}
              hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
              accessibilityRole="adjustable"
              accessibilityValue={{ min, max, now: v }}
              style={{
                position: 'absolute',
                left: xFor(v) - THUMB / 2,
                width: THUMB,
                height: THUMB,
                borderRadius: THUMB / 2,
                backgroundColor: '#ffffff',
                borderWidth: 2,
                borderColor: activeColor,
                shadowColor: '#000000',
                shadowOpacity: 0.2,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
                elevation: 2,
              }}
            />
          ))}
      </View>
    </View>
  );
}
