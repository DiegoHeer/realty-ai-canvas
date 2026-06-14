import 'maplibre-gl/dist/maplibre-gl.css';

import type { Listing } from '@realty/types';
import { useMemo } from 'react';
import { Layer, Map, Marker, Source } from 'react-map-gl/maplibre';

import type { ListingMapProps } from './listing-map';
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
const DEFAULT_CENTER = { longitude: 4.9041, latitude: 52.3676 }; // Amsterdam

/** Web map via react-map-gl (MapLibre GL JS). Selected by Metro on web. */
export function ListingMap({ listings, polygons, onSelect }: ListingMapProps) {
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
      initialViewState={{ ...center, zoom: 11 }}
      mapStyle={MAP_STYLE}
      style={{ width: '100%', height: '100%' }}>
      {polygons && polygons.length > 0 && (
        <Source id="area-polygons" type="geojson" data={toFeatureCollection(polygons)}>
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
        </Source>
      )}
      {listings.map((listing: Listing) => (
        <Marker
          key={listing.id}
          longitude={listing.location.longitude}
          latitude={listing.location.latitude}
          onClick={() => onSelect?.(listing.id)}>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 8px',
              borderRadius: 999,
              border: '1px solid #fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>
            {priceLabel(listing)}
          </div>
        </Marker>
      ))}
    </Map>
  );
}

function priceLabel(listing: Listing): string {
  const k = Math.round(listing.price / 1000);
  return k >= 1 ? `${listing.currency === 'EUR' ? '€' : ''}${k}k` : `${listing.price}`;
}
