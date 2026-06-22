import { useEffect, useState } from 'react';

/** Opacity bounds the loading pulse eases between. */
export const PULSE_MIN_OPACITY = 0.12;
export const PULSE_MAX_OPACITY = 0.5;

const STEP_MS = 70;
const PERIOD_MS = 1100;

/**
 * Drives a fill opacity that eases smoothly up and down between
 * {@link PULSE_MIN_OPACITY} and {@link PULSE_MAX_OPACITY} while `active` — used
 * by the city overlay shown while its neighborhoods load. Returns the resting
 * minimum when idle. Mount the consumer only while loading so the interval (and
 * its re-renders) lives just that long.
 */
export function usePulseOpacity(active: boolean): number {
  const [opacity, setOpacity] = useState(PULSE_MIN_OPACITY);
  useEffect(() => {
    if (!active) return;
    let phase = 0;
    const id = setInterval(() => {
      phase += (STEP_MS / PERIOD_MS) * 2 * Math.PI;
      const t = 0.5 - 0.5 * Math.cos(phase); // smooth 0 → 1 → 0
      setOpacity(PULSE_MIN_OPACITY + (PULSE_MAX_OPACITY - PULSE_MIN_OPACITY) * t);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [active]);
  // Derive the idle value rather than setting state in the effect (avoids a
  // synchronous setState there); while mounted the consumer keeps `active` true.
  return active ? opacity : PULSE_MIN_OPACITY;
}
