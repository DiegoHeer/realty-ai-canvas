import { useListings } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import { ListingCard } from '@realty/ui';
import { router } from 'expo-router';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRecentViews } from '@/lib/recent-views';

function openListing(id: string) {
  router.push({ pathname: '/listing/[id]', params: { id } });
}

/**
 * Horizontal carousel of recently opened listings, pulled from persistent
 * storage. Rendered as the list header so it scrolls away with the feed;
 * renders nothing until the user has viewed at least one listing.
 */
function RecentlyViewed() {
  const { recentViews, clearRecentViews } = useRecentViews();
  const { t } = useTranslation();

  if (recentViews.length === 0) return null;

  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center justify-between px-1">
        <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t('listings.recentlyViewed')}
        </Text>
        <Pressable onPress={clearRecentViews} hitSlop={8} accessibilityRole="button">
          <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
            {t('listings.clearRecent')}
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {recentViews.map((listing) => (
          <View key={listing.id} className="mr-3 w-72">
            <ListingCard listing={listing} onPress={() => openListing(listing.id)} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function ListingsScreen() {
  const { data: listings = [], isLoading, refetch, isRefetching } = useListings();
  const { t } = useTranslation();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-100 dark:bg-black">
      <View className="px-4 pb-2 pt-2">
        <Text className="text-2xl font-bold text-neutral-900 dark:text-white">
          {t('listings.title')}
        </Text>
        <Text className="text-sm text-neutral-500">
          {isLoading ? t('common.loading') : t('listings.count', { count: listings.length })}
        </Text>
      </View>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 128 }}
        showsVerticalScrollIndicator={false}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListHeaderComponent={RecentlyViewed}
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => openListing(item.id)} />
        )}
      />
    </SafeAreaView>
  );
}
