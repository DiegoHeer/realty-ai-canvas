import { useTranslation } from '@realty/i18n';
import { Pressable, ScrollView, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useColorScheme } from '@/hooks/use-color-scheme';

// Dummy filter categories for now — labels live in i18n under `filters.*`.
const FILTERS = [
  'favorites',
  'shops',
  'hotspots',
  'noise',
  'airQuality',
  'restaurants',
  'parks',
] as const;

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

function ShopIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function FlameIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

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
        d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function UtensilsIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeSvg>
  );
}

function LeafIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"
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
  shops: ShopIcon,
  hotspots: FlameIcon,
  noise: VolumeIcon,
  airQuality: WindIcon,
  restaurants: UtensilsIcon,
  parks: LeafIcon,
};

/**
 * Horizontal, scrollable row of filter pills shown under the search bar. The
 * pills are placeholders for now (no behavior wired up) but read their labels
 * from i18n so they're translation-ready. Each pill carries a stroked SVG icon
 * matching the text color in both light and dark mode.
 */
export function FilterPills() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  // Match the pill text: neutral-900 in light, white in dark.
  const iconColor = scheme === 'dark' ? '#ffffff' : '#171717';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
      {FILTERS.map((key) => {
        const Icon = FILTER_ICONS[key];
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            className="flex-row items-center gap-2 rounded-full bg-white px-4 py-2 shadow-md shadow-black/20 active:bg-neutral-100 dark:bg-neutral-800 dark:active:bg-neutral-700">
            <Icon color={iconColor} />
            <Text className="text-lg font-medium text-neutral-900 dark:text-white">
              {t(`filters.${key}`)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
