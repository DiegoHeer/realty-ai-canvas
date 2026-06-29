import { formatPrice } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import type { Listing } from '@realty/types';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { HeartIcon } from './icons';
import { Brand } from '../constants/theme';
import { toggleLike, useIsLiked } from '../lib/likes';

export interface ListingCardProps {
  listing: Listing;
  /** Tapping the card body (open the full listing). */
  onPress?: () => void;
  /** Dismiss the card. */
  onClose?: () => void;
}

/**
 * Compact preview of a listing — a condensed version of the detail screen,
 * shown above the tab bar when a map marker is selected. Layout mirrors the
 * Airbnb map preview: full-width cover image with an overlaid close button,
 * then the listing details stacked beneath.
 */
export function ListingCard({ listing, onPress, onClose }: ListingCardProps) {
  const { t, i18n } = useTranslation();
  const liked = useIsLiked(listing.id);
  const cover = listing.images[0];

  const facts = [
    listing.bedrooms ? t('listing.beds', { count: listing.bedrooms }) : null,
    listing.bathrooms ? t('listing.baths', { count: listing.bathrooms }) : null,
    listing.areaSqm ? t('listing.area', { value: listing.areaSqm }) : null,
  ].filter((f): f is string => f != null);

  return (
    <View className="overflow-hidden rounded-2xl bg-white shadow-lg dark:bg-neutral-900">
      {/* Card body: tapping anywhere here opens the full listing. The action
          buttons below are rendered as siblings (overlaid) rather than nested
          inside this Pressable — on web a Pressable becomes a <button>, and a
          <button> cannot legally contain another <button>. */}
      <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-95">
        <View>
          {cover ? (
            <Image source={{ uri: cover.url }} style={{ width: '100%', height: 180 }} contentFit="cover" />
          ) : (
            <View className="h-[180px] w-full bg-neutral-200 dark:bg-neutral-800" />
          )}
        </View>

        <View className="gap-0.5 p-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-base font-semibold text-neutral-900 dark:text-white" numberOfLines={1}>
              {listing.title}
            </Text>
            <Text className="text-xs font-medium uppercase text-blue-600 dark:text-blue-400">
              {t(`listing.status.${listing.status}`)}
            </Text>
          </View>

          <Text className="text-sm text-neutral-500" numberOfLines={1}>
            {listing.address.line1}, {listing.address.postalCode} {listing.address.city}
          </Text>

          {facts.length ? (
            <Text className="text-sm text-neutral-500">{facts.join('  ·  ')}</Text>
          ) : null}

          <Text className="mt-0.5 text-base font-bold text-neutral-900 dark:text-white">
            {formatPrice(listing.price, listing.currency, i18n.language)}
          </Text>
        </View>
      </Pressable>

      <View
        className="absolute inset-x-0 top-0 flex-row justify-end gap-3 p-5"
        pointerEvents="box-none">
        <Pressable
          onPress={() => toggleLike(listing)}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={t(liked ? 'listing.unlike' : 'listing.like')}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full bg-white shadow active:opacity-70">
          <HeartIcon filled={liked} color={liked ? Brand.blue : '#404040'} />
        </Pressable>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('listing.close')}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full bg-white shadow active:opacity-70">
          <Text className="text-2xl leading-none text-neutral-700">×</Text>
        </Pressable>
      </View>
    </View>
  );
}
