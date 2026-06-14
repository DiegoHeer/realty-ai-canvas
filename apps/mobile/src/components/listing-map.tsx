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

import {
  areasCenter,
  FILL_OPACITY,
  LABELS_BEFORE_ID,
  OUTLINE_WIDTH,
  toFeatureCollection,
} from './area-polygons';

// OpenMapTiles Positron GL style, hosted keyless by OpenFreeMap.
// https://github.com/openmaptiles/positron-gl-style
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const DEFAULT_CENTER: [number, number] = [4.9041, 52.3676]; // [lng, lat] Amsterdam

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
    <Map style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE}>
      <Camera ref={cameraRef} center={center} zoom={11} />
      {polygons && polygons.length > 0 && (
        <GeoJSONSource id="area-polygons" data={toFeatureCollection(polygons)}>
          <Layer
            id="area-polygons-fill"
            type="fill"
            beforeId={LABELS_BEFORE_ID}
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': FILL_OPACITY }}
          />
          <Layer
            id="area-polygons-outline"
            type="line"
            beforeId={LABELS_BEFORE_ID}
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
          <View style={styles.marker}>
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
    backgroundColor: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  markerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
