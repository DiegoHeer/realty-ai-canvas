import { useAreas, useListings } from '@realty/data';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingCard } from '@/components/listing-card';
import { ListingMap, type ListingMapRef } from '@/components/listing-map';
import { LocationSearch } from '@/components/location-search';
import { zoomForType } from '@/lib/pdok';

export default function MapScreen() {
  const { data: listings = [], isLoading } = useListings();
  const { data: areas = [] } = useAreas();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ListingMapRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => listings.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId],
  );

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-black">
      <ListingMap
        ref={mapRef}
        listings={listings}
        polygons={areas}
        onSelect={(id) => setSelectedId(id)}
      />
      <View
        className="absolute inset-x-0 px-4"
        style={{ top: insets.top + 8 }}
        pointerEvents="box-none">
        <LocationSearch
          onResult={(r) =>
            mapRef.current?.flyTo({
              longitude: r.longitude,
              latitude: r.latitude,
              zoom: zoomForType(r.type),
            })
          }
        />
      </View>
      {selected && (
        <View
          className="absolute inset-x-0 px-4"
          style={{ bottom: insets.bottom + 8 }}
          pointerEvents="box-none">
          <ListingCard
            listing={selected}
            onPress={() => router.push({ pathname: '/listing/[id]', params: { id: selected.id } })}
            onClose={() => setSelectedId(null)}
          />
        </View>
      )}
      {isLoading && (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}
