import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Hand-drawn glyphs that render identically on iOS, Android and web without an
 * icon-font dependency.
 */

/**
 * A heart glyph used for the "save"/favorite affordance. `filled` toggles the
 * saved state: outlined when unsaved, painted solid in `color` when saved.
 */
export function HeartIcon({
  filled,
  color,
  size = 20,
}: {
  filled: boolean;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
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
