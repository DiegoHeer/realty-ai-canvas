import { useListings } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import { ListingCard } from '@realty/ui';
import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
          />
        )}
      />
    </SafeAreaView>
  );
}
