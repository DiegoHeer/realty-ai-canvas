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
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  areasCenter,
  FILL_OPACITY,
  OUTLINE_WIDTH,
  toFeatureCollection,
} from './area-polygons';
import { useMapStyle } from './map-style';
import { useRecentViews } from '../lib/recent-views';

const MARKER_COLOR = '#2563eb'; // blue-600
const MARKER_COLOR_VIEWED = '#60a5fa'; // blue-400 — lighter, for recently viewed

const DEFAULT_CENTER: [number, number] = [4.9041, 52.3676]; // [lng, lat] Amsterdam

// The search bar overlays the top of the map, so park the compass in the
// bottom-left corner instead — clear of both the search field and the listing
// preview card (which spans the bottom but is inset from the left edge).
const COMPASS_MARGIN = 16;

export interface ListingMapProps {
  listings: Listing[];
  /** Colored area overlays drawn beneath the markers, each at 50% fill opacity. */
  polygons?: AreaPolygon[];
  onSelect?: (id: string) => void;
}

/** Imperative handle for driving the camera, e.g. flying to a search result. */
export interface ListingMapRef {
  flyTo: (target: { longitude: number; latitude: number; zoom?: number }) => void;
}

/**
 * Native map (iOS/Android) via MapLibre React Native (v11).
 * Requires a custom dev build — MapLibre's native module is not in Expo Go.
 * The web implementation lives in `listing-map.web.tsx`.
 */
export const ListingMap = forwardRef<ListingMapRef, ListingMapProps>(function ListingMap(
  { listings, polygons, onSelect },
  ref,
) {
  const cameraRef = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();
  const { mapStyle, polygonsBeforeId } = useMapStyle();
  const { recentViews } = useRecentViews();
  const viewedIds = useMemo(
    () => new Set(recentViews.map((listing) => listing.id)),
    [recentViews],
  );

  useImperativeHandle(ref, () => ({
    flyTo: ({ longitude, latitude, zoom }) =>
      cameraRef.current?.flyTo({ center: [longitude, latitude], zoom, duration: 1200 }),
  }));

  // Prefer framing the polygons (the map's overlay focus); fall back to the
  // first listing, then a sensible default. Memoized — the bbox scan is O(verts).
  const center = useMemo<[number, number]>(() => {
    const area = polygons && polygons.length > 0 ? areasCenter(polygons) : null;
    if (area) return [area.longitude, area.latitude];
    const first = listings[0]?.location;
    return first ? [first.longitude, first.latitude] : DEFAULT_CENTER;
  }, [polygons, listings]);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle}
      compassPosition={{
        bottom: insets.bottom + COMPASS_MARGIN,
        left: COMPASS_MARGIN,
      }}>
      <Camera ref={cameraRef} center={center} zoom={11} />
      {polygons && polygons.length > 0 && (
        <GeoJSONSource id="area-polygons" data={toFeatureCollection(polygons)}>
          <Layer
            id="area-polygons-fill"
            type="fill"
            beforeId={polygonsBeforeId}
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': FILL_OPACITY }}
          />
          <Layer
            id="area-polygons-outline"
            type="line"
            beforeId={polygonsBeforeId}
            paint={{ 'line-color': ['get', 'color'], 'line-width': OUTLINE_WIDTH }}
          />
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
          onPress={() => onSelect?.(listing.id)}>
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

function priceLabel(listing: Listing): string {
  const k = Math.round(listing.price / 1000);
  return k >= 1 ? `${listing.currency === 'EUR' ? '€' : ''}${k}k` : `${listing.price}`;
}

const styles = StyleSheet.create({
  marker: {
    backgroundColor: MARKER_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  markerViewed: {
    backgroundColor: MARKER_COLOR_VIEWED,
  },
  markerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
