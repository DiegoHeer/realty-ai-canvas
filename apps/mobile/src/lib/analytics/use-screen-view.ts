import { useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

import { trackPageview } from './client';
import { segmentsToPattern } from './route-pattern';

/**
 * Fire a Plausible pageview whenever the current route pattern changes. Mount
 * once, in the root layout. Sends the route *pattern* (`/listing/:id`), never a
 * concrete path, and dedupes consecutive identical patterns so a re-render or a
 * same-screen param change doesn't double-count.
 */
export function useScreenView(): void {
  const segments = useSegments();
  // useSegments() may return a fresh array each render; key on the content.
  const joined = (segments ?? []).join('/');
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (joined === '') return; // navigator not mounted yet
    const pattern = segmentsToPattern(joined.split('/'));
    if (pattern === last.current) return;
    last.current = pattern;
    trackPageview(pattern);
  }, [joined]);
}
