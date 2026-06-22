import { useAreas, useCities, useListings, useStats } from '@realty/data';
import type { AreaPolygon } from '@realty/types';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { areasCenter } from '@/components/area-polygons';
import { AreaSheet } from '@/components/area-sheet';
import { FilterPills } from '@/components/filter-pills';
import { ListingCard } from '@/components/listing-card';
import { ListingMap, type ListingMapRef } from '@/components/listing-map';
import { LocationSearch, type LocationSearchRef } from '@/components/location-search';
import { useEffectiveColorScheme } from '@/components/map-style';
import { Brand } from '@/constants/theme';
import { loadAreas, loadCities, loadStats } from '@/lib/area-cache';
import { colorAreasByStat } from '@/lib/area-choropleth';
import { buildCityIndex, findCityAt } from '@/lib/city-hit-test';
import { normalizeStats } from '@/lib/neighborhood-stats';
import { zoomForType } from '@/lib/pdok';
import { recordRecentView } from '@/lib/recent-views';

export default function MapScreen() {
  const { data: listings = [], isLoading } = useListings();
  const { data: cities = [] } = useCities(loadCities);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ListingMapRef>(null);
  const searchRef = useRef<LocationSearchRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  // Quick-filter chips below the search bar. Tapping one toggles its selection;
  // the number selected drives the badge on the search bar's filters button.
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => new Set());
  const toggleFilter = useCallback((key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  // No city is selected until the user taps one. Until then the map shows no
  // neighborhoods; tapping a city loads + shows that city's neighborhoods.
  const [selectedCity, setSelectedCity] = useState<
    { code: string; name: string; geometry: AreaPolygon['geometry'] } | null
  >(null);

  const { data: areas = [], isFetching: areasFetching } = useAreas(selectedCity?.code, loadAreas);
  const { data: stats = [] } = useStats(selectedCity?.code, loadStats);

  // Precompute city bounding boxes once so a tap ray-casts only the polygons
  // whose bbox contains it. Cities load once and are cached, so this is cheap.
  const cityIndex = useMemo(() => buildCityIndex(cities), [cities]);

  const selected = useMemo(
    () => listings.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId],
  );

  const selectedArea = useMemo(
    () => areas.find((a) => a.id === selectedAreaId) ?? null,
    [areas, selectedAreaId],
  );

  // Stats are a separate dataset matched to areas by code (=== the area's id).
  // Normalize on the way in so 2024-vintage records (most neighborhoods outside
  // Den Haag) speak the same field vocabulary as 2023 ones — see normalizeStats.
  const statsByCode = useMemo(
    () => new Map(stats.map((s) => [s.code, normalizeStats(s)])),
    [stats],
  );
  const selectedAreaStats = selectedArea ? statsByCode.get(selectedArea.id) ?? null : null;

  // Shade each neighborhood by its inhabitant count relative to the rest of the
  // municipality: light→dark blue (more = darker) on the light basemap, inverted
  // to brighter = more on the dark one. Recomputed when areas, stats or theme change.
  const scheme = useEffectiveColorScheme();
  const coloredAreas = useMemo(
    () => colorAreasByStat(areas, statsByCode, { scheme }),
    [areas, statsByCode, scheme],
  );

  // Once a city's neighborhoods are visible, surface its name in the search
  // placeholder; otherwise the field keeps its default "Search" hint.
  const cityName = selectedCity && areas.length > 0 ? selectedCity.name : undefined;

  // While the tapped city's neighborhoods load, pulse its outline as a loading
  // hint. Cleared the moment they arrive or another city is picked (both flip
  // this back to null), so the overlay never lingers.
  const loadingCityPolygon: AreaPolygon | null =
    selectedCity && areasFetching
      ? { id: selectedCity.code, color: Brand.blue, geometry: selectedCity.geometry }
      : null;

  // Selecting a marker shows its preview card, which counts as a view — record
  // it so the pin recolors immediately (the map reads from the same store).
  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSelectedAreaId(null);
      const listing = listings.find((l) => l.id === id);
      if (listing) recordRecentView(listing);
    },
    [listings],
  );

  // Selecting an area and a listing are mutually exclusive — the area sheet and
  // the listing card both anchor to the bottom, so showing one dismisses the other.
  const handleSelectPolygon = useCallback(
    (id: string) => {
      setSelectedAreaId(id);
      setSelectedId(null);
      // Pan (no zoom) so the area sits two-fifths down, clear of the sheet below.
      const area = areas.find((a) => a.id === id);
      const center = area ? areasCenter([area]) : null;
      if (center) mapRef.current?.focusArea(center);
    },
    [areas],
  );

  // A tap that isn't on a neighborhood overlay: find which city it lands in and
  // switch to it. A hit on the already-selected city is a no-op (its own
  // overlays handle taps); cities don't overlap, so at most one matches.
  const handleMapPress = useCallback(
    (coord: { longitude: number; latitude: number }) => {
      const hit = findCityAt([coord.longitude, coord.latitude], cityIndex);
      if (!hit || hit.code === selectedCity?.code) return;
      setSelectedCity({ code: hit.code, name: hit.name, geometry: hit.geometry });
      setSelectedAreaId(null);
      setSelectedId(null);
    },
    [cityIndex, selectedCity],
  );

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-black">
      <ListingMap
        ref={mapRef}
        listings={listings}
        polygons={coloredAreas}
        onSelect={handleSelect}
        onSelectPolygon={handleSelectPolygon}
        onMapPress={handleMapPress}
        loadingPolygon={loadingCityPolygon}
        selectedPolygonId={selectedAreaId}
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
          placeholder={cityName}
          activeFilterCount={activeFilters.size}
          onResult={(r) =>
            mapRef.current?.flyTo({
              longitude: r.longitude,
              latitude: r.latitude,
              zoom: zoomForType(r.type),
            })
          }
        />
        <View className="mt-2">
          <FilterPills selected={activeFilters} onToggle={toggleFilter} />
        </View>
        {/* While a tapped city's neighborhoods download, show a spinner centered
            below the pills. Cached cities resolve instantly, so it rarely shows. */}
        {selectedCity && areasFetching && (
          <View
            className="mt-3 self-center rounded-full bg-white p-2.5 shadow-md shadow-black/20 dark:bg-neutral-800"
            pointerEvents="none">
            <ActivityIndicator />
          </View>
        )}
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
      {/* Draggable, animated card for a selected area. Rendered in its own Modal
          so it overlays the native tab bar; dragging it off screen deselects. */}
      <AreaSheet
        area={selectedArea}
        stats={selectedAreaStats}
        municipality={selectedCity?.name ?? ''}
        onClose={() => setSelectedAreaId(null)}
      />
    </View>
  );
}
