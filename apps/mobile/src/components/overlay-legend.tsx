import { useTranslation } from '@realty/i18n';
import { ScrollView, Text, View } from 'react-native';

import type { MapOverlay } from '@/lib/map-overlays';

/**
 * Compact legend for the active map overlay: a horizontally scrollable strip of
 * color swatches with their value ranges/classes, shown in a rounded card under
 * the pills. The colors mirror what the backing service paints (verified
 * against its legend), so the strip explains the map rather than approximating
 * it. Building-level overlays (energy labels, bouwjaar) render nothing when the
 * camera is too far out — then the strip shows a "zoom in" hint instead.
 */
export function OverlayLegend({ overlay, zoom }: { overlay: MapOverlay; zoom: number }) {
  const { t } = useTranslation();
  const belowZoomFloor = overlay.visibleFromZoom != null && zoom < overlay.visibleFromZoom;
  return (
    <View className="mt-2 self-center overflow-hidden rounded-2xl bg-white shadow-md shadow-black/20 dark:bg-neutral-800">
      {belowZoomFloor ? (
        <Text className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
          {t('layers.zoomHint')}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }}>
          {overlay.legend.map((entry) => (
            <View key={entry.label} className="flex-row items-center gap-1.5">
              <View
                className="h-3 w-3 rounded-sm border border-black/20 dark:border-white/30"
                style={{ backgroundColor: entry.color }}
              />
              <Text className="text-xs font-medium text-neutral-900 dark:text-white">
                {entry.i18n ? t(`layers.legend.${entry.label}`) : entry.label}
              </Text>
            </View>
          ))}
          {overlay.unit && (
            <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {overlay.unit}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}
