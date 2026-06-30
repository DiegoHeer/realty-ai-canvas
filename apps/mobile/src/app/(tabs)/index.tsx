import { useAreas, useCities, useListings, useStats } from '@realty/data';
import type { AreaPolygon } from '@realty/types';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { colorAreasByStat, rampFor, selectInhabitants, statDomain } from '@/lib/area-choropleth';
import { buildCityIndex, findCityAt } from '@/lib/city-hit-test';
import { countActiveFilters, filtersToQuery, useFilters } from '@/lib/filters';
import { clearMapFocus, useMapFocus } from '@/lib/map-focus';
import { normalizeStats } from '@/lib/neighborhood-stats';
import { type GeocodeResult, zoomForType } from '@/lib/pdok';
import { recordRecentView } from '@/lib/recent-views';

// Zoom level at or above which the map auto-loads the neighborhoods under its
// centre. The initial framing sits at zoom 11 (no city selected yet); zooming
// past this — roughly a single municipality filling the screen, matching the
// `woonplaats` search zoom in `zoomForType` — loads that city's overlays.
const AUTO_LOAD_AREAS_ZOOM = 12;

export default function MapScreen() {
  const { filters } = useFilters();
  // Filters (and sort) drive the query: the server returns only matching,
  // geocoded homes (capped at the page size), so the map renders them directly.
  const query = useMemo(() => filtersToQuery(filters), [filters]);
  const { data: listings = [], isLoading } = useListings(query);
  const { data: cities = [] } = useCities(loadCities);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ListingMapRef>(null);
  const searchRef = useRef<LocationSearchRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  // Quick-filter chips below the search bar — their own toggle state, separate
  // from the search filters (the filters page drives the map + the count badge).
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

  // A city chosen during the intro tour: once the city shapes are loaded, focus
  // the map on it (fly + select, so its neighborhoods load) and clear the
  // request so it fires only once. Needs the geometry from `cities`, which is
  // empty in mock/offline builds — there the request is simply left unconsumed.
  const pendingFocus = useMapFocus();
  // Consume a one-shot external signal (set when the tour finishes, before the
  // map mounts) and reflect it into local selection + an imperative camera move.
  // This is the "subscribe to an external system" effect the rule is meant to
  // allow; it just can't see that through the store indirection, so disable it
  // here (cf. hooks/use-color-scheme.web.ts).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!pendingFocus || cities.length === 0) return;
    const city = cities.find((c) => c.code === pendingFocus.code);
    clearMapFocus();
    if (!city) return;
    setSelectedCity({ code: city.code, name: pendingFocus.name, geometry: city.geometry });
    setSelectedAreaId(null);
    setSelectedId(null);
    const center = areasCenter([{ id: city.code, color: Brand.blue, geometry: city.geometry }]);
    if (center) mapRef.current?.flyTo({ ...center, zoom: 11 });
  }, [pendingFocus, cities]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  // Scale legend shown above the area sheet at peek: the municipality-wide
  // inhabitant range the map colors span, plus the ramp for the active theme.
  // Null when there's no spread (single neighborhood or all equal).
  const areaLegend = useMemo(() => {
    const domain = statDomain(areas, statsByCode);
    return domain ? { min: domain.min, max: domain.max, ramp: rampFor(scheme) } : null;
  }, [areas, statsByCode, scheme]);

  // The selected neighborhood's inhabitant count, marked on the legend — read
  // with the same selector the choropleth uses so the marker matches its fill.
  const selectedInhabitants = selectedAreaStats ? selectInhabitants(selectedAreaStats) : null;

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

  // Find which city a coordinate lands in and switch to it (loading its
  // neighborhoods). A hit on the already-selected city is a no-op (its own
  // overlays handle taps); cities don't overlap, so at most one matches.
  const selectCityAt = useCallback(
    (coord: { longitude: number; latitude: number }) => {
      const hit = findCityAt([coord.longitude, coord.latitude], cityIndex);
      if (!hit || hit.code === selectedCity?.code) return;
      setSelectedCity({ code: hit.code, name: hit.name, geometry: hit.geometry });
      setSelectedAreaId(null);
      setSelectedId(null);
    },
    [cityIndex, selectedCity],
  );

  // A tap that isn't on a neighborhood overlay falls through to here.
  const handleMapPress = selectCityAt;

  // Once the camera settles, auto-load the neighborhoods under the viewport
  // centre — but only when zoomed in far enough that the user is clearly
  // looking at a single city, as if they'd tapped the middle of the map. Below
  // that zoom we leave it to an explicit tap, so panning the country at a
  // glance doesn't keep swapping cities underfoot.
  const handleCameraIdle = useCallback(
    ({ longitude, latitude, zoom }: { longitude: number; latitude: number; zoom: number }) => {
      if (zoom < AUTO_LOAD_AREAS_ZOOM) return;
      selectCityAt({ longitude, latitude });
    },
    [selectCityAt],
  );

  // Picking a search result flies the camera there and loads the surrounding
  // city's neighborhoods. The hit-test handles every result type — including a
  // municipality (gemeente), which flies to a zoom below the auto-load
  // threshold and so wouldn't otherwise trigger the camera-idle load.
  const handleSearchResult = useCallback(
    (r: GeocodeResult) => {
      mapRef.current?.flyTo({ longitude: r.longitude, latitude: r.latitude, zoom: zoomForType(r.type) });
      selectCityAt({ longitude: r.longitude, latitude: r.latitude });
    },
    [selectCityAt],
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
        onCameraIdle={handleCameraIdle}
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
          activeFilterCount={countActiveFilters(filters)}
          onOpenFilters={() => router.push('/settings/filters')}
          onResult={handleSearchResult}
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
        legend={areaLegend ? { ...areaLegend, value: selectedInhabitants } : null}
        onClose={() => setSelectedAreaId(null)}
      />
    </View>
  );
}
