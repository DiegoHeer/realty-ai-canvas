import { useTranslation } from '@realty/i18n';
import { Pressable, ScrollView, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useEffectiveColorScheme } from '@/components/map-style';

// Dummy filter categories for now — labels live in i18n under `filters.*`.
const FILTERS = ['favorites', 'recent', 'popular', 'new', 'sold'] as const;

type FilterKey = (typeof FILTERS)[number];

interface IconProps {
  size?: number;
  color: string;
}

// Feather/Lucide-style stroked icons, drawn as SVG so they render identically
// across web/iOS/Android without depending on an icon font (mirrors the
// SearchIcon approach in location-search.tsx).
function StrokeSvg({ size = 16, children }: { size?: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

function HeartIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function ClockIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path
        d="M12 7.5V12l3.5 2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function TrendingUpIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M22 7l-8.5 8.5-5-5L2 17"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 7h6v6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function SparklesIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M11 3l2.8 5.2L19 11l-5.2 2.8L11 19l-2.8-5.2L3 11l5.2-2.8z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M19.5 2.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function TagIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7 7h.01"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

const FILTER_ICONS: Record<FilterKey, (props: IconProps) => React.ReactElement> = {
  favorites: HeartIcon,
  recent: ClockIcon,
  popular: TrendingUpIcon,
  new: SparklesIcon,
  sold: TagIcon,
};

interface FilterPillsProps {
  /** Keys of the currently-selected filters. */
  selected?: ReadonlySet<string>;
  /** Toggle a filter's selection. */
  onToggle?: (key: FilterKey) => void;
}

/**
 * Horizontal, scrollable row of filter pills shown under the search bar. Tapping
 * a pill toggles its selection (a filled pill = active); the number selected
 * feeds the count badge on the search bar's filters button. Labels read from
 * i18n; each pill carries a stroked SVG icon matching its text color in both
 * themes. Selection only tracks "configured" state for now — it doesn't yet
 * filter the listings.
 */
export function FilterPills({ selected, onToggle }: FilterPillsProps = {}) {
  const { t } = useTranslation();
  const isDark = useEffectiveColorScheme() === 'dark';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
      {FILTERS.map((key) => {
        const Icon = FILTER_ICONS[key];
        const active = selected?.has(key) ?? false;
        // Active pills invert: dark fill + light content (and the reverse in
        // dark mode). Set inline so the fill never depends on an uncompiled
        // class (a plain `bg-neutral-900` isn't in the generated stylesheet).
        const pillBg = active ? (isDark ? '#ffffff' : '#171717') : isDark ? '#262626' : '#ffffff';
        const fg = active ? (isDark ? '#171717' : '#ffffff') : isDark ? '#ffffff' : '#171717';
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onToggle?.(key)}
            style={{ backgroundColor: pillBg }}
            className="flex-row items-center gap-2 rounded-full px-4 py-2 shadow-md shadow-black/20 active:opacity-80">
            <Icon color={fg} />
            <Text style={{ color: fg }} className="text-lg font-medium">
              {t(`filters.${key}`)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
