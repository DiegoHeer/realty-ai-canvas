import { usePathname, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

import { trackPageview } from './client';
import { segmentsToPattern } from './route-pattern';

/**
 * Fire a Plausible pageview whenever the current route changes. Mount once,
 * in the root layout. Sends the route *pattern* (`/listing/:id`), never a
 * concrete path, but dedupes on the concrete path so navigating between two
 * screens that share a pattern (e.g. listing A → listing B) still counts as
 * two pageviews.
 */
export function useScreenView(): void {
  const segments = useSegments();
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === '') return; // navigator not mounted yet
    if (pathname === last.current) return;
    last.current = pathname;
    const pattern = segmentsToPattern(segments);
    trackPageview(pattern);
  }, [pathname, segments]);
}
