import 'maplibre-gl/dist/maplibre-gl.css';

import type { AreaPolygon, Listing } from '@realty/types';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { Layer, Map, type MapRef, Marker, Source } from 'react-map-gl/maplibre';

import type { ListingMapProps, ListingMapRef } from './listing-map';
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

/**
 * The tapped city's outline, pulsing in opacity while its neighborhoods load
 * (web mirror of the native overlay). Mounted only during the load; memoizes
 * the feature so each frame changes only the fill opacity, not the source data.
 */
function PulsingCityOverlay({ polygon, beforeId }: { polygon: AreaPolygon; beforeId?: string }) {
  const opacity = usePulseOpacity(true);
  const data = useMemo(() => toFeatureCollection([polygon]), [polygon]);
  return (
    <Source id="loading-city" type="geojson" data={data}>
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
    </Source>
  );
}

/** Web map via react-map-gl (MapLibre GL JS). Selected by Metro on web. */
export const ListingMap = forwardRef<ListingMapRef, ListingMapProps>(function ListingMap(
  { listings, polygons, onSelect, onSelectPolygon, selectedPolygonId, onMapPress, loadingPolygon },
  ref,
) {
  const mapRef = useRef<MapRef>(null);
  const { height: screenH } = useWindowDimensions();
  const { mapStyle, polygonsBeforeId, scheme } = useMapStyle();
  const { recentViews } = useRecentViews();
  const viewedIds = useMemo(
    () => new Set(recentViews.map((listing) => listing.id)),
    [recentViews],
  );

  useImperativeHandle(ref, () => ({
    flyTo: ({ longitude, latitude, zoom }) =>
      mapRef.current?.flyTo({ center: [longitude, latitude], zoom, duration: 1200 }),
    focusArea: ({ longitude, latitude }) =>
      // Negative y offset lifts the centered coordinate up to AREA_FOCUS_ANCHOR_Y.
      mapRef.current?.easeTo({
        center: [longitude, latitude],
        offset: [0, Math.round(screenH * (AREA_FOCUS_ANCHOR_Y - 0.5))],
        duration: 600,
      }),
  }));

  // Prefer framing the polygons (the map's overlay focus); fall back to the
  // first listing, then a sensible default. Memoized — the bbox scan is O(verts).
  const center = useMemo(() => {
    const area = polygons && polygons.length > 0 ? areasCenter(polygons) : null;
    if (area) return area;
    const first = listings[0]?.location;
    return first ? { longitude: first.longitude, latitude: first.latitude } : DEFAULT_CENTER;
  }, [polygons, listings]);

  return (
    <Map
      ref={mapRef}
      initialViewState={{ ...center, zoom: 11 }}
      mapStyle={mapStyle}
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={polygons && polygons.length > 0 ? ['area-polygons-fill'] : []}
      onClick={(e) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') {
          onSelectPolygon?.(id);
          return;
        }
        // A click off any area overlay → hit-test which city it lands in.
        onMapPress?.({ longitude: e.lngLat.lng, latitude: e.lngLat.lat });
      }}>
      {loadingPolygon && <PulsingCityOverlay polygon={loadingPolygon} beforeId={polygonsBeforeId} />}
      {polygons && polygons.length > 0 && (
        <Source id="area-polygons" type="geojson" data={toFeatureCollection(polygons)}>
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
        </Source>
      )}
      {listings.map((listing: Listing) => (
        <Marker
          key={listing.id}
          longitude={listing.location.longitude}
          latitude={listing.location.latitude}
          onClick={() => onSelect?.(listing.id)}>
          <div
            // Touch devices don't reliably fire the Marker's click handler;
            // handle the tap explicitly and preventDefault so the synthetic
            // mouse click that follows doesn't select the listing twice.
            onTouchEnd={(e) => {
              e.preventDefault();
              onSelect?.(listing.id);
            }}
            style={{
              background: viewedIds.has(listing.id) ? Brand.blueLight : Brand.blue,
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 8px',
              borderRadius: 999,
              border: '1px solid #fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              touchAction: 'manipulation',
            }}>
            {priceLabel(listing)}
          </div>
        </Marker>
      ))}
    </Map>
  );
});
