import { formatPrice, useListing } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: listing, isLoading, isError } = useListing(id);
  const { t, i18n } = useTranslation();

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

          <View className="mt-2 flex-row gap-6 border-y border-neutral-200 py-3 dark:border-neutral-800">
            <Stat label={t('listing.bedrooms')} value={`${listing.bedrooms}`} />
            <Stat label={t('listing.bathrooms')} value={`${listing.bathrooms}`} />
            <Stat label={t('listing.areaLabel')} value={t('listing.area', { value: listing.areaSqm })} />
          </View>

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
        </View>
      </ScrollView>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-base font-semibold text-neutral-900 dark:text-white">{value}</Text>
      <Text className="text-xs text-neutral-500">{label}</Text>
    </View>
  );
}
