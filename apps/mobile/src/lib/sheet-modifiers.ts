import type { ModifierConfig } from '@expo/ui/jetpack-compose/modifiers';

/**
 * Modifiers that make a sheet `Row` fill the available width (full-width tap
 * target). Platform-specific: the Android/iOS variants live in
 * `sheet-modifiers.android.ts` / `sheet-modifiers.ios.ts`, which import from
 * the native-only `@expo/ui` modifier entry points. Those require the native
 * `ExpoUI` module, so they must never be imported on web — this base/web build
 * resolves to `undefined` (web `Row` already stretches).
 */
export const FILL_WIDTH: ModifierConfig[] | undefined = undefined;
