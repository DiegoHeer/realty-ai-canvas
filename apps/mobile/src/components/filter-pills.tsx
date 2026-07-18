import { useTranslation } from '@realty/i18n';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useEffectiveColorScheme } from '@/components/map-style';
import { Brand } from '@/constants/theme';
import { MAP_OVERLAYS, type OverlayId } from '@/lib/map-overlays';

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

function VolumeIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M11 5L6 9H2v6h4l5 4V5z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function WindIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M9.59 4.59A2 2 0 1 1 11 8H2M12.59 19.41A2 2 0 1 0 14 16H2M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function ZapIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function HouseIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 21v-8h6v8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function MapIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M1 6v15l7-4 8 4 7-4V2l-7 4-8-4z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M8 2v15M16 6v15" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </StrokeSvg>
  );
}

function BirdIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M16 7h.01M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20M20 7l2 .5-2 .5M10 18v3M14 17.75V21M7 18a6 6 0 0 0 3.84-10.61"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function EuroIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M4 10h12M4 14h9M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

const OVERLAY_ICONS: Record<OverlayId, (props: IconProps) => React.ReactElement> = {
  noise: VolumeIcon,
  airQuality: WindIcon,
  energyLabels: ZapIcon,
  buildingAge: HouseIcon,
  wozValue: EuroIcon,
  zoning: MapIcon,
  treeHeight: BirdIcon,
};

interface FilterPillsProps {
  /** Keys of the currently-selected filters. */
  selected?: ReadonlySet<string>;
  /** Toggle a filter's selection. */
  onToggle?: (key: FilterKey) => void;
  /** The map overlay currently shown, if any — its pill renders active. */
  activeOverlay?: OverlayId | null;
  /** Toggle a map overlay on/off (overlays are mutually exclusive). */
  onToggleOverlay?: (id: OverlayId) => void;
}

/**
 * Horizontal, scrollable row of pills shown under the search bar. The first
 * group are listing quick-filters: tapping one toggles its selection (a filled
 * pill = active); the number selected feeds the count badge on the search
 * bar's filters button. Favorites and Recent source the map from the locally
 * saved likes / recent-views snapshots, and Sold narrows the server query to
 * sold residences (the map screen owns all three); the remaining pills
 * (Popular, New) only track "configured" state for now and don't yet filter
 * the listings. After a divider follow the map-layer pills
 * (noise, air quality, …): mutually exclusive toggles, the active one filled
 * with the brand blue to read as a map state rather than a listing filter.
 * Labels read from i18n; each pill carries a stroked SVG icon matching its
 * text color in both themes.
 */
export function FilterPills({ selected, onToggle, activeOverlay, onToggleOverlay }: FilterPillsProps = {}) {
  const { t } = useTranslation();
  const isDark = useEffectiveColorScheme() === 'dark';
  const inactiveBg = isDark ? '#262626' : '#ffffff';
  const inactiveFg = isDark ? '#ffffff' : '#171717';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      // The pills carry a drop shadow that extends below/above their box, which a
      // horizontal ScrollView clips against its tight content-sized frame. Pad the
      // content vertically to give the shadow room, then pull the frame back with a
      // matching negative margin so the surrounding layout is unaffected. Left/right
      // padding stays minimal so the row lines up with the search bar above it.
      style={{ marginVertical: -8 }}
      contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingHorizontal: 2 }}>
      {FILTERS.map((key) => {
        const Icon = FILTER_ICONS[key];
        const active = selected?.has(key) ?? false;
        // Active pills invert: dark fill + light content (and the reverse in
        // dark mode). Set inline so the fill never depends on an uncompiled
        // class (a plain `bg-neutral-900` isn't in the generated stylesheet).
        const pillBg = active ? (isDark ? '#ffffff' : '#171717') : inactiveBg;
        const fg = active ? (isDark ? '#171717' : '#ffffff') : inactiveFg;
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
      {/* Hairline divider separating listing filters from map layers. */}
      <View className="my-1.5 w-px self-stretch bg-neutral-400/60 dark:bg-neutral-500/60" />
      {MAP_OVERLAYS.map(({ id }) => {
        const Icon = OVERLAY_ICONS[id];
        const active = activeOverlay === id;
        const pillBg = active ? Brand.blue : inactiveBg;
        const fg = active ? '#ffffff' : inactiveFg;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onToggleOverlay?.(id)}
            style={{ backgroundColor: pillBg }}
            className="flex-row items-center gap-2 rounded-full px-4 py-2 shadow-md shadow-black/20 active:opacity-80">
            <Icon color={fg} />
            <Text style={{ color: fg }} className="text-lg font-medium">
              {t(`layers.${id}`)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
