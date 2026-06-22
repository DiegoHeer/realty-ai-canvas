import type { AreaPolygon, Listing } from '@realty/types';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
} from '@maplibre/maplibre-react-native';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AREA_FOCUS_ANCHOR_Y,
  areasCenter,
  fillOpacityFor,
  outlineWidthFor,
  SELECTED_DASH_ARRAY,
  SELECTED_DASH_COLOR,
  SELECTED_DASH_WIDTH,
  selectedFilter,
  toFeatureCollection,
} from './area-polygons';
import { useMapStyle } from './map-style';
import { DEFAULT_CENTER, priceLabel } from './map-shared';
import { usePulseOpacity } from './use-pulse-opacity';
import { outlineColorFor } from '../lib/area-choropleth';
import { useRecentViews } from '../lib/recent-views';
import { Brand } from '../constants/theme';

// The search bar overlays the top of the map, so park the compass in the
// bottom-left corner instead — clear of both the search field and the listing
// preview card (which spans the bottom but is inset from the left edge).
const COMPASS_MARGIN = 16;

// A marker tap on the native map also fires the map's own tap gesture — the RN
// marker overlay and the native gesture are independent event streams, so both
// land. Within this many ms of a marker tap, treat a map press as part of that
// same gesture and ignore it, so tapping a marker selects the listing without
// also switching municipality. (The web map stops the click from propagating.)
const MARKER_TAP_GRACE_MS = 300;

/**
 * The tapped city's own outline, pulsing in opacity while its neighborhoods
 * load. Mounted only during the load (the parent passes null once the data
 * arrives or another city is picked), so the pulse interval lives just that
 * long. Memoizes the feature so each frame changes only the fill opacity, not
 * the source data.
 */
function PulsingCityOverlay({ polygon, beforeId }: { polygon: AreaPolygon; beforeId?: string }) {
  const opacity = usePulseOpacity(true);
  const data = useMemo(() => toFeatureCollection([polygon]), [polygon]);
  return (
    <GeoJSONSource id="loading-city" data={data}>
      <Layer
        id="loading-city-fill"
        type="fill"
        beforeId={beforeId}
        paint={{ 'fill-color': polygon.color, 'fill-opacity': opacity }}
      />
      <Layer
        id="loading-city-outline"
        type="line"
        beforeId={beforeId}
        paint={{ 'line-color': polygon.color, 'line-width': 1.5, 'line-opacity': 0.9 }}
      />
    </GeoJSONSource>
  );
}

export interface ListingMapProps {
  listings: Listing[];
  /** Colored area overlays drawn beneath the markers, each at 50% fill opacity. */
  polygons?: AreaPolygon[];
  onSelect?: (id: string) => void;
  /** Fired with the polygon's id when one of the area overlays is tapped. */
  onSelectPolygon?: (id: string) => void;
  /** Id of the area overlay to highlight (denser fill + bolder outline). */
  selectedPolygonId?: string | null;
  /**
   * Fired with the tapped geographic coordinate for a press that isn't on an
   * area overlay — used to hit-test which city was tapped.
   */
  onMapPress?: (coord: { longitude: number; latitude: number }) => void;
  /**
   * The tapped city's outline, pulsing while its neighborhoods load. Null hides
   * it (data arrived, or no city is loading).
   */
  loadingPolygon?: AreaPolygon | null;
}

/** Imperative handle for driving the camera, e.g. flying to a search result. */
export interface ListingMapRef {
  flyTo: (target: { longitude: number; latitude: number; zoom?: number }) => void;
  /**
   * Pan (no zoom change) so the coordinate sits two-fifths down / centered
   * horizontally — leaving room for the area sheet below it.
   */
  focusArea: (target: { longitude: number; latitude: number }) => void;
}

/**
 * Native map (iOS/Android) via MapLibre React Native (v11).
 * Requires a custom dev build — MapLibre's native module is not in Expo Go.
 * The web implementation lives in `listing-map.web.tsx`.
 */
export const ListingMap = forwardRef<ListingMapRef, ListingMapProps>(function ListingMap(
  { listings, polygons, onSelect, onSelectPolygon, selectedPolygonId, onMapPress, loadingPolygon },
  ref,
) {
  const cameraRef = useRef<CameraRef>(null);
  // Timestamp of the last marker tap; see MARKER_TAP_GRACE_MS.
  const markerTapAtRef = useRef(0);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { mapStyle, polygonsBeforeId, scheme } = useMapStyle();
  const { recentViews } = useRecentViews();
  const viewedIds = useMemo(
    () => new Set(recentViews.map((listing) => listing.id)),
    [recentViews],
  );

  useImperativeHandle(ref, () => ({
    flyTo: ({ longitude, latitude, zoom }) =>
      // Reset any focus padding so search results recenter normally.
      cameraRef.current?.flyTo({
        center: [longitude, latitude],
        zoom,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        duration: 1200,
      }),
    focusArea: ({ longitude, latitude }) =>
      // Bottom padding pushes the centered coordinate up to AREA_FOCUS_ANCHOR_Y.
      cameraRef.current?.easeTo({
        center: [longitude, latitude],
        padding: { top: 0, right: 0, bottom: Math.round(screenH * (1 - 2 * AREA_FOCUS_ANCHOR_Y)), left: 0 },
        duration: 600,
      }),
  }));

  // Prefer framing the polygons (the map's overlay focus); fall back to the
  // first listing, then a sensible default. Memoized — the bbox scan is O(verts).
  const center = useMemo<[number, number]>(() => {
    const area = polygons && polygons.length > 0 ? areasCenter(polygons) : null;
    if (area) return [area.longitude, area.latitude];
    const first = listings[0]?.location;
    return first ? [first.longitude, first.latitude] : [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude];
  }, [polygons, listings]);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle}
      // A press not consumed by an area overlay falls through to here; hit-test
      // it against the cities. `lngLat` is a [longitude, latitude] tuple.
      onPress={(e) => {
        // Ignore the press a marker tap fires underneath itself (see
        // markerTapAtRef) — a marker tap must not also switch municipality.
        if (Date.now() - markerTapAtRef.current < MARKER_TAP_GRACE_MS) return;
        const [longitude, latitude] = e.nativeEvent.lngLat;
        onMapPress?.({ longitude, latitude });
      }}
      compassPosition={{
        bottom: insets.bottom + COMPASS_MARGIN,
        left: COMPASS_MARGIN,
      }}>
      {/* Uncontrolled initial framing only: applied once on load. Camera moves
          are then driven solely by the imperative ref (search flyTo, area
          focusArea) — loading a tapped city's neighborhoods must not move it. */}
      <Camera ref={cameraRef} initialViewState={{ center, zoom: 11 }} />
      {loadingPolygon && <PulsingCityOverlay polygon={loadingPolygon} beforeId={polygonsBeforeId} />}
      {polygons && polygons.length > 0 && (
        <GeoJSONSource
          id="area-polygons"
          data={toFeatureCollection(polygons)}
          onPress={(e) => {
            const id = e.nativeEvent.features[0]?.properties?.id;
            if (typeof id === 'string') onSelectPolygon?.(id);
          }}>
          <Layer
            id="area-polygons-fill"
            type="fill"
            beforeId={polygonsBeforeId}
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': fillOpacityFor(selectedPolygonId) }}
          />
          <Layer
            id="area-polygons-outline"
            type="line"
            beforeId={polygonsBeforeId}
            paint={{ 'line-color': outlineColorFor(scheme), 'line-width': outlineWidthFor(selectedPolygonId) }}
          />
          {selectedPolygonId && (
            <Layer
              id="area-polygons-selected"
              type="line"
              beforeId={polygonsBeforeId}
              filter={selectedFilter(selectedPolygonId)}
              paint={{
                'line-color': SELECTED_DASH_COLOR,
                'line-width': SELECTED_DASH_WIDTH,
                'line-dasharray': SELECTED_DASH_ARRAY,
              }}
            />
          )}
        </GeoJSONSource>
      )}
      {listings.map((listing) => (
        <Marker
          key={listing.id}
          id={listing.id}
          lngLat={[listing.location.longitude, listing.location.latitude]}
          // Use the Marker's own onPress rather than a nested Pressable: a
          // Pressable inside a Marker (MarkerView) does not fire onPress
          // reliably on Android. https://github.com/maplibre/maplibre-react-native/issues/1018
          onPress={() => {
            markerTapAtRef.current = Date.now();
            onSelect?.(listing.id);
          }}>
          <View
            style={[
              styles.marker,
              viewedIds.has(listing.id) && styles.markerViewed,
            ]}>
            <Text style={styles.markerText} numberOfLines={1}>
              {priceLabel(listing)}
            </Text>
          </View>
        </Marker>
      ))}
    </Map>
  );
});

const styles = StyleSheet.create({
  marker: {
    backgroundColor: Brand.blue,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  markerViewed: {
    backgroundColor: Brand.blueLight,
  },
  markerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
