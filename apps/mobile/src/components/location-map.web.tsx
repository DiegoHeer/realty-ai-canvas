import 'maplibre-gl/dist/maplibre-gl.css';

import type { StyleSpecification } from 'maplibre-gl';
import { Map, Marker } from 'react-map-gl/maplibre';

import type { LocationMapProps } from './location-map';

// OpenMapTiles Positron GL style, hosted keyless by OpenFreeMap.
// https://github.com/openmaptiles/positron-gl-style
const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

/** Web static preview map via react-map-gl. Selected by Metro on web. */
export function LocationMap({
  latitude,
  longitude,
  zoom = 14,
  mapStyle = DEFAULT_MAP_STYLE,
  interactive = false,
}: LocationMapProps) {
  return (
    <Map
      initialViewState={{ longitude, latitude, zoom }}
      mapStyle={mapStyle as string | StyleSpecification}
      style={{ width: '100%', height: '100%' }}
      interactive={interactive}
      attributionControl={false}>
      <Marker longitude={longitude} latitude={latitude}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            background: '#2563eb',
            border: '2px solid #fff',
          }}
        />
      </Marker>
    </Map>
  );
}
