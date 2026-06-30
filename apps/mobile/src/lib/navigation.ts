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
