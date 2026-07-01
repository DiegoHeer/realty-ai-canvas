import { type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useEffectiveColorScheme } from '@/components/map-style';
import { Brand } from '@/constants/theme';

/**
 * Shared building blocks for the intro tour pages: a consistent page scaffold
 * (hero badge + title + subtitle + content), the progress dots, the bottom
 * control bar buttons, and a small set of stroked SVG hero glyphs. Kept separate
 * from the flow orchestrator (`flow.tsx`) so each page stays declarative.
 */

const STROKE = { strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Tinted rounded badge holding a page's hero glyph. */
export function HeroBadge({ children }: { children: ReactNode }) {
  return (
    <View className="h-24 w-24 items-center justify-center rounded-3xl bg-blue-50 dark:bg-blue-950">
      {children}
    </View>
  );
}

/** Vertically scrollable page body, sized to the pager cell by the flow. */
export function OnboardingPage({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      // flex:1 so the body fills its (fixed-height) pager cell on web, where a
      // ScrollView with no height otherwise collapses and hides its content.
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 24, gap: 20 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

/** Centered hero + title + subtitle shown at the top of every page. */
export function OnboardingHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <View className="items-center gap-4 pt-2">
      <HeroBadge>{icon}</HeroBadge>
      <View className="gap-2">
        <Text className="text-center text-2xl font-bold text-neutral-900 dark:text-white">
          {title}
        </Text>
        <Text className="text-center text-base leading-6 text-neutral-500 dark:text-neutral-400">
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

/**
 * Row of progress dots; the active page's dot is elongated and brand-blue.
 * `progress` is the pager's continuous position in page units (scroll x /
 * page width), so each dot's width and colour interpolate live mid-swipe
 * instead of snapping when a page settles.
 */
export function ProgressDots({
  count,
  progress,
  label,
}: {
  count: number;
  progress: Animated.AnimatedInterpolation<number> | Animated.Value;
  label: string;
}) {
  const isDark = useEffectiveColorScheme() === 'dark';
  const inactive = isDark ? '#3f3f46' : '#d4d4d4';
  return (
    <View className="flex-row items-center gap-2" accessibilityLabel={label}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          style={{
            width: progress.interpolate({
              inputRange: [i - 1, i, i + 1],
              outputRange: [8, 22, 8],
              extrapolate: 'clamp',
            }),
            height: 8,
            borderRadius: 4,
            backgroundColor: progress.interpolate({
              inputRange: [i - 1, i, i + 1],
              outputRange: [inactive, Brand.blue, inactive],
              extrapolate: 'clamp',
            }),
          }}
        />
      ))}
    </View>
  );
}

/** Primary (filled blue) call-to-action used by the bottom control bar. */
export function PrimaryButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      className="items-center justify-center rounded-xl bg-blue-600 px-7 py-3.5 active:opacity-80">
      <Text className="text-base font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

/** Low-emphasis text button (Back / Skip tour). */
export function TextButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      className="px-2 py-2 active:opacity-60">
      <Text className="text-base font-medium text-neutral-500 dark:text-neutral-400">{label}</Text>
    </Pressable>
  );
}

// --- Hero glyphs -------------------------------------------------------------
// Feather/Lucide-style stroked SVGs, tinted brand-blue, mirroring the icon
// approach used elsewhere (profile.tsx, filter-pills.tsx).

function HeroSvg({ size = 44, children }: { size?: number; children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

const HERO = Brand.blue;

/** House — the welcome page. */
export function HomeGlyph({ size }: { size?: number }) {
  return (
    <HeroSvg size={size}>
      <Path d="M3 10.5 12 3l9 7.5" stroke={HERO} {...STROKE} />
      <Path d="M5 9.5V21h14V9.5" stroke={HERO} {...STROKE} />
      <Path d="M9.5 21v-6h5v6" stroke={HERO} {...STROKE} />
    </HeroSvg>
  );
}

/** Map pin on a folded map — the "map & insights" feature. */
export function MapPinGlyph({ size }: { size?: number }) {
  return (
    <HeroSvg size={size}>
      <Path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z" stroke={HERO} {...STROKE} />
      <Circle cx={12} cy={10} r={2.5} stroke={HERO} {...STROKE} />
    </HeroSvg>
  );
}

/** Slider controls — the "powerful filters" feature. */
export function SlidersGlyph({ size }: { size?: number }) {
  return (
    <HeroSvg size={size}>
      <Path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" stroke={HERO} {...STROKE} />
      <Circle cx={16} cy={6} r={2} stroke={HERO} {...STROKE} />
      <Circle cx={8} cy={12} r={2} stroke={HERO} {...STROKE} />
      <Circle cx={14} cy={18} r={2} stroke={HERO} {...STROKE} />
    </HeroSvg>
  );
}

/** Skyline of buildings — the city picker. */
export function BuildingsGlyph({ size }: { size?: number }) {
  return (
    <HeroSvg size={size}>
      <Rect x={3} y={9} width={7} height={12} rx={1} stroke={HERO} {...STROKE} />
      <Rect x={12} y={4} width={9} height={17} rx={1} stroke={HERO} {...STROKE} />
      <Path d="M15.5 8h2M15.5 12h2M15.5 16h2M6 13h1.5M6 17h1.5" stroke={HERO} {...STROKE} />
    </HeroSvg>
  );
}

/** Person with a plus — the create-account page. */
export function AccountGlyph({ size }: { size?: number }) {
  return (
    <HeroSvg size={size}>
      <Circle cx={10} cy={8} r={3.5} stroke={HERO} {...STROKE} />
      <Path d="M4 20c0-3.3 2.7-6 6-6 1.5 0 2.9.55 4 1.46" stroke={HERO} {...STROKE} />
      <Path d="M18 14v6M15 17h6" stroke={HERO} {...STROKE} />
    </HeroSvg>
  );
}
