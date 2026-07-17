import { formatPrice } from '@realty/data';
import type { Listing } from '@realty/types';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

export interface ListingCardProps {
  listing: Listing;
  onPress?: () => void;
  /**
   * Optional action overlaid in the card's top-right corner (e.g. a
   * like/favorite button). Passed as a slot so this cross-package card stays
   * decoupled from the app's likes storage. Rendered as a sibling of the card's
   * Pressable rather than nested inside it — on web a Pressable becomes a
   * `<button>`, which cannot legally contain another `<button>`.
   */
  likeButton?: ReactNode;
}

/**
 * Cross-platform listing card. Styled with NativeWind so the same component
 * renders on iOS, Android and web. Used in the list view and reusable anywhere.
 */
export function ListingCard({ listing, onPress, likeButton }: ListingCardProps) {
  const { t, i18n } = useTranslation();
  const cover = listing.images[0];
  return (
    <View className="mb-3 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-neutral-900">
      <Pressable onPress={onPress} className="active:opacity-80">
        {cover ? (
          <Image source={{ uri: cover.url }} className="h-44 w-full" resizeMode="cover" />
        ) : (
          <View className="h-44 w-full bg-neutral-200 dark:bg-neutral-800" />
        )}
        <View className="gap-1 overflow-hidden p-3">
          {cover ? (
            <>
              <Image
                source={{ uri: cover.url }}
                resizeMode="cover"
                className="absolute inset-0 h-full w-full"
                style={{ transform: [{ scaleX: -1 }, { scaleY: -1 }] }}
              />
              <BlurView intensity={30} tint="default" style={StyleSheet.absoluteFill} />
              <View className="absolute inset-0 bg-white/5 dark:bg-black/5" />
            </>
          ) : null}
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-neutral-900 dark:text-white">
              {formatPrice(listing.price, listing.currency, i18n.language)}
            </Text>
            <Text className="text-xs font-medium uppercase text-blue-600 dark:text-blue-400">
              {t(`listing.status.${listing.status}`)}
            </Text>
          </View>
          <Text numberOfLines={1} className="text-sm text-neutral-700 dark:text-neutral-300">
            {listing.title}
          </Text>
          <Text numberOfLines={1} className="text-xs text-neutral-500">
            {listing.address.line1}, {listing.address.city}
          </Text>
          <View className="mt-1 flex-row gap-4">
            <Text className="text-xs text-neutral-500">
              {t('listing.beds', { count: listing.bedrooms })}
            </Text>
            <Text className="text-xs text-neutral-500">
              {t('listing.baths', { count: listing.bathrooms })}
            </Text>
            <Text className="text-xs text-neutral-500">
              {t('listing.area', { value: listing.areaSqm })}
            </Text>
          </View>
        </View>
      </Pressable>

      {likeButton ? (
        <View className="absolute right-0 top-0 p-3" pointerEvents="box-none">
          {likeButton}
        </View>
      ) : null}
    </View>
  );
}
