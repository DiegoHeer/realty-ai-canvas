import type { useRouter } from 'expo-router';

// Derived from the hook because this expo-router version exports neither a
// `Router` nor an `Href` type name directly.
type Router = ReturnType<typeof useRouter>;
type Href = Parameters<Router['replace']>[0];

/**
 * Run a navigation action on the next frame.
 *
 * Deferring a single frame avoids react-native-screens' "recycled bitmap" crash
 * on Android when a global state change (e.g. an auth-state update) and the
 * navigation happen in the same frame. Used by the post-action pops/dismissals
 * across the auth and settings screens so the workaround lives in one place.
 */
export function deferNavigation(action: () => void): void {
  requestAnimationFrame(action);
}

/**
 * Pop the current screen after a completed action, or land on `fallback` when
 * there is no history to pop — which happens whenever the screen was opened
 * directly by URL / deep link rather than pushed (routine on web, where the
 * OAuth flow makes /auth/login a plausible entry point). A bare `router.back()`
 * would no-op there, leaving the user stranded on a stale form. Deferred a
 * frame for the same reason as {@link deferNavigation}.
 */
export function popOrReplace(router: Router, fallback: Href): void {
  deferNavigation(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  });
}
