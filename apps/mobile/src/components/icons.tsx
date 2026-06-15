import { View } from 'react-native';

/**
 * Hand-drawn glyphs built from plain Views so they render identically on iOS,
 * Android and web without an icon-font dependency.
 */

/**
 * A bookmark glyph: a rounded body with a V-notch cut from the bottom. `filled`
 * toggles the saved state. The notch is painted in `cutoutColor` (the color of
 * the surface behind the icon) so it reads as a cut-out on both the filled and
 * outlined variants.
 */
export function BookmarkIcon({
  filled,
  color,
  cutoutColor = '#ffffff',
}: {
  filled: boolean;
  color: string;
  cutoutColor?: string;
}) {
  const WIDTH = 13;
  const HEIGHT = 17;
  const NOTCH = 6;
  return (
    <View style={{ width: WIDTH, height: HEIGHT }}>
      <View
        style={{
          width: WIDTH,
          height: HEIGHT,
          borderRadius: 2,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: filled ? color : 'transparent',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 0,
          height: 0,
          borderLeftWidth: WIDTH / 2,
          borderRightWidth: WIDTH / 2,
          borderBottomWidth: NOTCH,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: cutoutColor,
        }}
      />
    </View>
  );
}

/**
 * A share glyph: an upward arrow rising out of an open-topped tray, mirroring
 * the platform "share" affordance.
 */
export function ShareIcon({ color }: { color: string }) {
  const WIDTH = 16;
  const HEIGHT = 18;
  return (
    <View style={{ width: WIDTH, height: HEIGHT }}>
      {/* Tray (open top) */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: WIDTH,
          height: 9,
          borderWidth: 2,
          borderTopWidth: 0,
          borderColor: color,
          borderRadius: 2,
        }}
      />
      {/* Arrowhead */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: WIDTH / 2 - 4,
          width: 0,
          height: 0,
          borderLeftWidth: 4,
          borderRightWidth: 4,
          borderBottomWidth: 6,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      {/* Arrow shaft */}
      <View
        style={{
          position: 'absolute',
          top: 5,
          left: WIDTH / 2 - 1,
          width: 2,
          height: 7,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
