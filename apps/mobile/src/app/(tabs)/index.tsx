import { useAreas, useListings } from '@realty/data';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterPills } from '@/components/filter-pills';
import { ListingCard } from '@/components/listing-card';
import { ListingMap, type ListingMapRef } from '@/components/listing-map';
import { LocationSearch, type LocationSearchRef } from '@/components/location-search';
import { zoomForType } from '@/lib/pdok';
import { recordRecentView } from '@/lib/recent-views';

export default function MapScreen() {
  const { data: listings = [], isLoading } = useListings();
  const { data: areas = [] } = useAreas();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ListingMapRef>(null);
  const searchRef = useRef<LocationSearchRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);

  const selected = useMemo(
    () => listings.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId],
  );

  // Selecting a marker shows its preview card, which counts as a view — record
  // it so the pin recolors immediately (the map reads from the same store).
  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      const listing = listings.find((l) => l.id === id);
      if (listing) recordRecentView(listing);
    },
    [listings],
  );

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-black">
      <ListingMap
        ref={mapRef}
        listings={listings}
        polygons={areas}
        onSelect={handleSelect}
      />
      {/* Full-screen backdrop: while the search is active, a tap anywhere
          outside the field/dropdown collapses it and hides the keyboard.
          Rendered above the map but below the search overlay (which keeps its
          own taps), so only "outside" taps reach it. */}
      {searchActive && (
        <Pressable
          className="absolute inset-0"
          onPress={() => searchRef.current?.dismiss()}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <View
        className="absolute inset-x-0 px-4"
        style={{ top: insets.top + 8 }}
        pointerEvents="box-none">
        <LocationSearch
          ref={searchRef}
          onActiveChange={setSearchActive}
          onResult={(r) =>
            mapRef.current?.flyTo({
              longitude: r.longitude,
              latitude: r.latitude,
              zoom: zoomForType(r.type),
            })
          }
        />
        <View className="mt-2">
          <FilterPills />
        </View>
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
