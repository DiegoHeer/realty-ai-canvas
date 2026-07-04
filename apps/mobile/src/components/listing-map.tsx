import type { AreaPolygon, Listing } from '@realty/types';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  RasterSource,
  VectorSource,
} from '@maplibre/maplibre-react-native';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
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
import { BAG_PAND_SOURCE_LAYER, BUILDING_AGE_FILL, type MapOverlay } from '../lib/map-overlays';
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
   * Fired once the camera settles after a pan/zoom, with the viewport centre
   * and zoom. Lets the screen auto-load a city's neighborhoods once the user
   * has zoomed in far enough — as if they'd tapped the middle of the map.
   */
  onCameraIdle?: (state: { longitude: number; latitude: number; zoom: number }) => void;
  /**
   * The tapped city's outline, pulsing while its neighborhoods load. Null hides
   * it (data arrived, or no city is loading).
   */
  loadingPolygon?: AreaPolygon | null;
  /**
   * Active data overlay (noise, air quality, energy labels, …) drawn above the
   * basemap's buildings but below its labels. Null shows none.
   */
  overlay?: MapOverlay | null;
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
  { listings, polygons, onSelect, onSelectPolygon, selectedPolygonId, onMapPress, onCameraIdle, loadingPolygon, overlay },
  ref,
) {
  const cameraRef = useRef<CameraRef>(null);
  // Timestamp of the last marker tap; see MARKER_TAP_GRACE_MS.
  const markerTapAtRef = useRef(0);
  const insets = useSafeAreaInsets();
  const { mapStyle, polygonsBeforeId, overlayBeforeId, scheme } = useMapStyle();
  const { recentViews } = useRecentViews();
  const viewedIds = useMemo(
    () => new Set(recentViews.map((listing) => listing.id)),
    [recentViews],
  );

  useImperativeHandle(ref, () => ({
    flyTo: ({ longitude, latitude, zoom }) =>
      cameraRef.current?.flyTo({
        center: [longitude, latitude],
        zoom,
        duration: 1200,
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
      // Once a pan/zoom settles, report the viewport centre + zoom so the
      // screen can auto-load a city's neighborhoods when zoomed in far enough.
      onRegionDidChange={(e) => {
        const [longitude, latitude] = e.nativeEvent.center;
        onCameraIdle?.({ longitude, latitude, zoom: e.nativeEvent.zoom });
      }}
      compassPosition={{
        bottom: insets.bottom + COMPASS_MARGIN,
        left: COMPASS_MARGIN,
      }}>
      {/* Uncontrolled initial framing only: applied once on load. Camera moves
          are then driven solely by the imperative ref (search flyTo) — loading
          a tapped city's neighborhoods or selecting an area must not move it. */}
      <Camera ref={cameraRef} initialViewState={{ center, zoom: 11 }} />
      {/* Active data overlay. Source/layer ids are unique per overlay: the new
          overlay's layer can be created before the old source is torn down — a
          shared id would attach it to the outgoing source (or update that
          source in place with mismatched type/zoom bounds). */}
      {overlay && overlay.kind === 'raster' && (
        <RasterSource
          key={overlay.id}
          id={`overlay-${overlay.id}`}
          tiles={overlay.tiles}
          tileSize={512}
          minzoom={overlay.minzoom}
          maxzoom={overlay.maxzoom}>
          <Layer
            id={`overlay-${overlay.id}-raster`}
            type="raster"
            beforeId={overlayBeforeId}
            paint={{ 'raster-opacity': overlay.opacity }}
          />
        </RasterSource>
      )}
      {overlay && overlay.kind === 'buildings' && (
        <VectorSource
          key={overlay.id}
          id={`overlay-${overlay.id}`}
          tiles={overlay.tiles}
          minzoom={overlay.minzoom}
          maxzoom={overlay.maxzoom}>
          <Layer
            id={`overlay-${overlay.id}-buildings`}
            type="fill"
            source-layer={BAG_PAND_SOURCE_LAYER}
            beforeId={overlayBeforeId}
            paint={{ 'fill-color': BUILDING_AGE_FILL, 'fill-opacity': overlay.opacity }}
          />
        </VectorSource>
      )}
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
      {listings.map((listing) => {
        const viewed = viewedIds.has(listing.id);
        return (
          <Marker
            key={listing.id}
            id={listing.id}
            lngLat={[listing.location.longitude, listing.location.latitude]}
            // Anchor the tip of the pin tail (the marker's bottom-centre) on the
            // coordinate, so the bubble reads as a pin pointing at the listing.
            anchor="bottom"
            // Use the Marker's own onPress rather than a nested Pressable: a
            // Pressable inside a Marker (MarkerView) does not fire onPress
            // reliably on Android. https://github.com/maplibre/maplibre-react-native/issues/1018
            onPress={() => {
              markerTapAtRef.current = Date.now();
              onSelect?.(listing.id);
            }}>
            <View style={styles.markerWrap}>
              <View style={[styles.marker, viewed && styles.markerViewed]}>
                <Text style={styles.markerText} numberOfLines={1}>
                  {priceLabel(listing)}
                </Text>
              </View>
              <View style={[styles.markerArrow, viewed && styles.markerArrowViewed]} />
            </View>
          </Marker>
        );
      })}
    </Map>
  );
});

const styles = StyleSheet.create({
  // Stack the bubble over its tail and centre them, so the tail points straight
  // down from the middle of the bubble.
  markerWrap: {
    alignItems: 'center',
  },
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
  // Downward triangle tail that turns the bubble into a pin. Pulled up 1px so it
  // tucks under the bubble's white border, leaving no seam between the two.
  markerArrow: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Brand.blue,
  },
  markerArrowViewed: {
    borderTopColor: Brand.blueLight,
  },
  markerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
