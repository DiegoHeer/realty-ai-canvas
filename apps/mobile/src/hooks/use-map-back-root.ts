import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

// Tab routes the Android back button re-roots to the map. Pushed stack screens
// (listing/[id], settings/*) keep their own pathnames, so they never match and
// back keeps popping the stack as usual.
const REROOTED_TAB_PATHS = ['/explore', '/profile'];

/**
 * Makes the map tab (`/`) the root of Android back navigation: pressing back
 * on any other tab jumps to the map, and back on the map itself is left
 * unhandled so the system exits the app — the "start destination" contract
 * Android users expect.
 *
 * Requires `backBehavior="none"` on the tab bar (see app-tabs.tsx). The tab
 * router's own back handling anchors to the first trigger in the bar and
 * expo-router offers no way to point it at another tab without also reordering
 * the visible tabs, so it's disabled and this hook owns the back button
 * instead. The listener is only registered while a re-rooted tab is the
 * current route, which also keeps it clear of native back handling by modals.
 */
export function useMapBackRoot() {
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'android' || !REROOTED_TAB_PATHS.includes(pathname)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.navigate('/');
      return true;
    });
    return () => subscription.remove();
  }, [pathname]);
}
