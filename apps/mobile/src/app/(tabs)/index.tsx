import { useAreas, useListings } from '@realty/data';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { ListingMap } from '@/components/listing-map';

export default function MapScreen() {
  const { data: listings = [], isLoading } = useListings();
  const { data: areas = [] } = useAreas();

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-black">
      <ListingMap
        listings={listings}
        polygons={areas}
        onSelect={(id) => router.push({ pathname: '/listing/[id]', params: { id } })}
      />
      {isLoading && (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}
