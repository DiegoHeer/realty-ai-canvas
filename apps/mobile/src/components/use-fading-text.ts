import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

/** Timing of the cross-fade: fade out → hold invisible → fade in. */
export const FADE_OUT_MS = 400;
export const FADE_HOLD_MS = 100;
export const FADE_IN_MS = 400;

/**
 * Cross-fades a piece of display text. When `text` changes, the value shown so
 * far fades out ({@link FADE_OUT_MS}), holds invisible ({@link FADE_HOLD_MS}),
 * then the new value fades in ({@link FADE_IN_MS}) — so `displayed` lags `text`
 * by the fade-out. The initial text shows immediately; only changes animate.
 * Used by the search bar's placeholder overlay (a native placeholder can't
 * animate), which binds `opacity` to the text it renders.
 */
export function useFadingText(text: string): { displayed: string; opacity: Animated.Value } {
  const [displayed, setDisplayed] = useState(text);
  const [opacity] = useState(() => new Animated.Value(1));
  // The text most recently asked for. A change mid-fade starts a new sequence
  // (interrupting the old one); the superseded completion callback sees either
  // `finished: false` or a target mismatch and bails without swapping.
  const target = useRef(text);

  useEffect(() => {
    if (text === target.current) return;
    target.current = text;
    // JS driver throughout: the value keeps animating while the consumer is
    // unmounted (the placeholder hides while the user types), and the web
    // Animated backend doesn't support the native driver.
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: false }),
      Animated.delay(FADE_HOLD_MS),
    ]).start(({ finished }) => {
      if (!finished || target.current !== text) return;
      setDisplayed(text);
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: false }).start();
    });
  }, [text, opacity]);

  return { displayed, opacity };
}
