import { useEffect, useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';

import { useEffectiveColorScheme } from '@/components/map-style';

const THUMB = 24;
const TRACK_H = 4;
const HIST_H = 44;
// Horizontal inset so the end thumbs sit clear of the screen edges; otherwise a
// thumb grabbed at min/max collides with iOS's edge-swipe back gesture. The
// onLayout below measures the inset track, so all thumb math stays consistent.
const EDGE_PAD = 24;

interface RangeSliderProps {
  min: number;
  max: number;
  step?: number;
  /** One value for a single-thumb slider, or `[lo, hi]` for a range. */
  values: number[];
  onChange: (values: number[]) => void;
  /** Optional histogram buckets drawn behind the track (e.g. availability). */
  distribution?: number[];
  /** Fired when a thumb drag begins / ends — e.g. to suspend a parent gesture. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * A 1- or 2-thumb slider drawn from RN primitives + PanResponder (no native
 * slider dep, and PanResponder works on web too, so the static export renders).
 * Thumb positions are React-state-driven (the parent owns `values`). Each move
 * calls `onChange`, which re-renders this component, so the PanResponders are
 * created once and never recreated: handing an in-flight drag to a freshly
 * created responder (whose gestureState was never granted) makes its `dx`
 * garbage and snaps the thumb back. Their handlers read the live props/state
 * through a ref. An optional `distribution` paints a histogram behind the track,
 * buckets inside the selected range highlighted. Value text lives in the Filters
 * section headers.
 */
export function RangeSlider({
  min,
  max,
  step = 1,
  values,
  onChange,
  distribution,
  onDragStart,
  onDragEnd,
}: RangeSliderProps) {
  const isDark = useEffectiveColorScheme() === 'dark';
  const [width, setWidth] = useState(0);

  const trackColor = isDark ? '#404040' : '#e5e5e5';
  const activeColor = '#2563eb';
  const barColor = isDark ? '#525252' : '#d4d4d4';

  const isRange = values.length === 2;
  const xFor = (v: number) => (max === min ? 0 : ((v - min) / (max - min)) * width);

  // The responders read everything they need at gesture time from this ref,
  // refreshed after each render. (Reading a ref inside an event handler is fine;
  // reading/writing one during render is not — hence the effect.) This lets the
  // responders be created once below yet still see the live values/width/etc.
  const live = useRef({ values, width, min, max, step, onChange, onDragStart, onDragEnd });
  useEffect(() => {
    live.current = { values, width, min, max, step, onChange, onDragStart, onDragEnd };
  });

  // Created once for the component's life — NOT recreated per render. Every drag
  // calls onChange, which re-renders; recreating the responders would hand the
  // in-flight gesture to a new PanResponder whose gestureState was never granted,
  // so its `dx` is wrong and the thumb snaps back to where it started. A per-thumb
  // `startValue` (the value when the drag began) carries the grab-point.
  const [responders, setResponders] = useState<ReturnType<typeof PanResponder.create>[]>([]);
  useEffect(() => {
    setResponders(
      [0, 1].map((index) => {
        let startValue = 0;
        return PanResponder.create({
          // Grab on touch-down; only claim horizontal drags so a parent ScrollView
          // can still scroll vertically.
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
          onPanResponderGrant: () => {
            startValue = live.current.values[index];
            live.current.onDragStart?.();
          },
          onPanResponderMove: (_e, g) => {
            const s = live.current;
            if (s.width <= 0) return;
            const delta = (g.dx / s.width) * (s.max - s.min);
            let next = Math.round((startValue + delta) / s.step) * s.step;
            const range = s.values.length === 2;
            const lower = range && index === 1 ? s.values[0] : s.min;
            const upper = range && index === 0 ? s.values[1] : s.max;
            next = Math.min(upper, Math.max(lower, next));
            if (next === s.values[index]) return;
            const updated = [...s.values];
            updated[index] = next;
            s.onChange(updated);
          },
          onPanResponderRelease: () => live.current.onDragEnd?.(),
          onPanResponderTerminate: () => live.current.onDragEnd?.(),
        });
      }),
    );
  }, []);

  const maxCount = distribution && distribution.length > 0 ? Math.max(...distribution) : 0;

  return (
    <View
      style={{
        height: (distribution ? HIST_H : 0) + THUMB,
        justifyContent: 'flex-end',
        paddingHorizontal: EDGE_PAD,
      }}>
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
        {width > 0 && responders.length > 0 &&
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
