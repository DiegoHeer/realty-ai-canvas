import { useAreas, useCities, useListings, useStats } from '@realty/data';
import type { AreaPolygon, Listing } from '@realty/types';
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
import { BUILDINGS_3D_PITCH } from '@/components/map-shared';
import { useEffectiveColorScheme } from '@/components/map-style';
import { OverlayLegend } from '@/components/overlay-legend';
import { Brand } from '@/constants/theme';
import { trackOverlayEnabled } from '@/lib/analytics';
import { loadAreas, loadCities, loadStats } from '@/lib/area-cache';
import { colorAreasByStat, rampFor, selectInhabitants, statDomain } from '@/lib/area-choropleth';
import { buildCityIndex, findCityAt } from '@/lib/city-hit-test';
import { countActiveFilters, filtersToQuery, useFilters } from '@/lib/filters';
import { useLikes } from '@/lib/likes';
import { clearMapFocus, useMapFocus } from '@/lib/map-focus';
import { overlayById, type OverlayId } from '@/lib/map-overlays';
import { useMapSettings } from '@/lib/map-settings';
import { normalizeStats } from '@/lib/neighborhood-stats';
import { type GeocodeResult, zoomForType } from '@/lib/pdok';
import { recordRecentView, useRecentViews } from '@/lib/recent-views';

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
  // The Favorites/Recent pills swap the map's data source: instead of the
  // server's search results, show the locally stored snapshots — every liked /
  // recently viewed home, wherever it is, regardless of the current search
  // query (the stores keep whole Listings for exactly this). Both pills
  // together show the union, deduped by id (a home can be both). The camera
  // stays put, matching the rule that selection never pans the map.
  const { likes } = useLikes();
  const { recentViews } = useRecentViews();
  const favoritesActive = activeFilters.has('favorites');
  const recentActive = activeFilters.has('recent');
  const snapshotsActive = favoritesActive || recentActive;
  const shownListings = useMemo(() => {
    if (!snapshotsActive) return listings;
    const merged = new Map<string, Listing>();
    if (favoritesActive) for (const listing of likes) merged.set(listing.id, listing);
    if (recentActive) for (const listing of recentViews) merged.set(listing.id, listing);
    return [...merged.values()];
  }, [snapshotsActive, favoritesActive, recentActive, listings, likes, recentViews]);
  // The active map overlay (noise, air quality, …) — one at a time: tapping an
  // overlay pill swaps to it, tapping the active one turns it off.
  const [overlayId, setOverlayId] = useState<OverlayId | null>(null);
  const toggleOverlay = useCallback(
    (id: OverlayId) => {
      const enabling = overlayId !== id;
      setOverlayId(enabling ? id : null);
      if (enabling) trackOverlayEnabled(id);
    },
    [overlayId],
  );
  const overlay = overlayById(overlayId);
  // Viewport zoom as of the last camera settle — drives the legend's "zoom in"
  // hint for overlays that only render at building-level zooms.
  const [mapZoom, setMapZoom] = useState(11);
  // No city is selected until the user taps one. Until then the map shows no
  // neighborhoods; tapping a city loads + shows that city's neighborhoods.
  const [selectedCity, setSelectedCity] = useState<
    { code: string; name: string; geometry: AreaPolygon['geometry'] } | null
  >(null);

  const { data: areas = [], isFetching: areasFetching } = useAreas(selectedCity?.code, loadAreas);
  const { data: stats = [] } = useStats(selectedCity?.code, loadStats);

  // 3D buildings preference, set on the Map settings page (see profile.tsx).
  // The map mounts already tilted to match it (its own Camera/initialViewState),
  // so this effect only needs to re-tilt on a live toggle while this screen is
  // already open — skip the mount-time run to avoid re-animating to the same pitch.
  const { buildings3D } = useMapSettings();
  const mountedPitchRef = useRef(false);
  useEffect(() => {
    if (!mountedPitchRef.current) {
      mountedPitchRef.current = true;
      return;
    }
    mapRef.current?.setPitch(buildings3D ? BUILDINGS_3D_PITCH : 0);
  }, [buildings3D]);

  // A city chosen during the intro tour, or the first saved preferred city
  // re-queued at boot: once the city shapes are loaded, focus the map on it
  // (fly + select, so its neighborhoods load) and clear the request so it
  // fires only once. Needs the geometry from `cities`, which is empty in
  // mock/offline builds — there the request is simply left unconsumed.
  const pendingFocus = useMapFocus();
  // Consume a one-shot external signal (set when the tour finishes or at boot,
  // before the map mounts) and reflect it into local selection + an imperative
  // camera move.
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

  // Resolve the selection against what's on the map — a snapshot marker must
  // open its card even when the listing isn't in the server results. A side
  // effect: deselecting happens for free when a toggle removes the marker.
  const selected = useMemo(
    () => shownListings.find((l) => l.id === selectedId) ?? null,
    [shownListings, selectedId],
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
      const listing = shownListings.find((l) => l.id === id);
      if (listing) recordRecentView(listing);
    },
    [shownListings],
  );

  // Selecting an area and a listing are mutually exclusive — the area sheet and
  // the listing card both anchor to the bottom, so showing one dismisses the other.
  // The camera deliberately stays put — selection must not pan the map.
  const handleSelectPolygon = useCallback((id: string) => {
    setSelectedAreaId(id);
    setSelectedId(null);
  }, []);

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
      setMapZoom(zoom);
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
        listings={shownListings}
        polygons={coloredAreas}
        onSelect={handleSelect}
        onSelectPolygon={handleSelectPolygon}
        onMapPress={handleMapPress}
        onCameraIdle={handleCameraIdle}
        loadingPolygon={loadingCityPolygon}
        selectedPolygonId={selectedAreaId}
        overlay={overlay}
        buildings3D={buildings3D}
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
          <FilterPills
            selected={activeFilters}
            onToggle={toggleFilter}
            activeOverlay={overlayId}
            onToggleOverlay={toggleOverlay}
          />
        </View>
        {/* Legend for the active overlay, explaining the colors it paints. */}
        {overlay && <OverlayLegend overlay={overlay} zoom={mapZoom} />}
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
      {/* The spinner tracks the server query — irrelevant (and misleading)
          while a snapshot pill sources the map from disk instead. */}
      {isLoading && !snapshotsActive && (
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
