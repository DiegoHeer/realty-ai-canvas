import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { formatPrice, useListing } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { recordRecentView } from '@/lib/recent-views';
import { LocationMap } from '../../components/location-map';
// maptiler-basic GL style, with its key-gated MapTiler source/glyphs rewritten
// to keyless OpenFreeMap endpoints. https://github.com/openmaptiles/maptiler-basic-gl-style
import maptilerBasicStyle from '../../components/maptiler-basic-style.json';

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: listing, isLoading, isError } = useListing(id);
  const { t, i18n } = useTranslation();

  // Snapshot the listing as recently viewed once it loads. Re-runs (and so
  // refreshes the cached copy) whenever a different listing resolves.
  useEffect(() => {
    if (listing) recordRecentView(listing);
  }, [listing]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-black">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError || !listing) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-black">
        <Text className="text-center text-neutral-600 dark:text-neutral-300">
          {t('listing.loadError')}
        </Text>
      </View>
    );
  }

  const cover = listing.images[0];

  const stats = [
    listing.areaSqm
      ? { label: t('listing.areaLabel'), value: t('listing.area', { value: listing.areaSqm }) }
      : null,
    listing.roomCount ? { label: t('listing.rooms'), value: `${listing.roomCount}` } : null,
    listing.bedrooms ? { label: t('listing.bedrooms'), value: `${listing.bedrooms}` } : null,
    listing.bathrooms ? { label: t('listing.bathrooms'), value: `${listing.bathrooms}` } : null,
    listing.constructionPeriod
      ? { label: t('listing.constructionPeriod'), value: listing.constructionPeriod }
      : null,
    listing.energyLabel
      ? {
          label: t('listing.energyLabel'),
          value: listing.energyLabel,
          valueColor: energyLabelColor(listing.energyLabel),
        }
      : null,
  ].filter((s): s is { label: string; value: string; valueColor?: string } => s != null);

  return (
    <>
      <Stack.Screen options={{ title: listing.address.city }} />
      <ScrollView className="flex-1 bg-white dark:bg-black">
        {cover ? (
          <Image source={{ uri: cover.url }} style={{ width: '100%', height: 288 }} contentFit="cover" />
        ) : (
          <View className="h-72 w-full bg-neutral-200 dark:bg-neutral-800" />
        )}
        <View className="gap-3 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-3xl font-bold text-neutral-900 dark:text-white">
              {formatPrice(listing.price, listing.currency, i18n.language)}
            </Text>
            <Text className="text-sm font-medium uppercase text-blue-600 dark:text-blue-400">
              {t(`listing.status.${listing.status}`)}
            </Text>
          </View>

          <Text className="text-lg text-neutral-800 dark:text-neutral-200">{listing.title}</Text>
          <Text className="text-sm text-neutral-500">
            {listing.address.line1}, {listing.address.postalCode} {listing.address.city}
          </Text>

          {stats.length ? (
            <View className="mt-2 flex-row flex-wrap gap-x-6 gap-y-3 border-y border-neutral-200 py-3 dark:border-neutral-800">
              {stats.map((s) => (
                <Stat key={s.label} label={s.label} value={s.value} valueColor={s.valueColor} />
              ))}
            </View>
          ) : null}


          {listing.description ? (
            <Text className="text-base leading-6 text-neutral-700 dark:text-neutral-300">
              {listing.description}
            </Text>
          ) : null}

          {listing.sourceUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => openBrowserAsync(listing.sourceUrl as string)}
              className="mt-2 items-center rounded-xl bg-blue-600 py-3 active:opacity-80">
              <Text className="text-base font-semibold text-white">
                {t('listing.visitRealtor')}
              </Text>
            </Pressable>
          ) : null}

          <View className="mt-1 h-64 w-full overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
            <LocationMap
              latitude={listing.location.latitude}
              longitude={listing.location.longitude}
              mapStyle={maptilerBasicStyle as unknown as StyleSpecification}
              interactive
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View className="gap-0.5">
      <Text
        className="text-base font-semibold text-neutral-900 dark:text-white"
        style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </Text>
      <Text className="text-xs text-neutral-500">{label}</Text>
    </View>
  );
}

// Energy labels run from green (most efficient) to red (least efficient). The
// base letter drives the color; any "+" suffix (A+, A++, …) stays as green as A.
const ENERGY_LABEL_COLORS: Record<string, string> = {
  A: '#16a34a', // green
  B: '#65a30d', // lime
  C: '#ca8a04', // yellow
  D: '#ea580c', // orange
  E: '#f97316', // deep orange
  F: '#dc2626', // red
  G: '#b91c1c', // dark red
};

function energyLabelColor(label: string): string | undefined {
  const letter = label.trim().charAt(0).toUpperCase();
  return ENERGY_LABEL_COLORS[letter];
}
