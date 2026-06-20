import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, View } from 'react-native';

import { MAP_STYLE_LIGHT } from './map-style';
import { Brand } from '../constants/theme';

export interface LocationMapProps {
  latitude: number;
  longitude: number;
  /** Closer is more "where exactly"; the default frames the street. */
  zoom?: number;
  /** MapLibre style URL or inline style spec. Defaults to OpenFreeMap Positron. */
  mapStyle?: string | StyleSpecification;
  /** Allow pan/zoom gestures. Off by default so it reads as a static thumbnail. */
  interactive?: boolean;
}

/**
 * Native (iOS/Android) static preview map: a single pin centered on a point,
 * with gestures disabled so it reads as a thumbnail rather than a map you pan.
 * The web implementation lives in `location-map.web.tsx`.
 */
export function LocationMap({
  latitude,
  longitude,
  zoom = 14,
  mapStyle = MAP_STYLE_LIGHT,
  interactive = false,
}: LocationMapProps) {
  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle}
      // Render into a TextureView, not the default GLSurfaceView. A SurfaceView
      // punches a separate window through the view tree: it ignores the parent's
      // rounded corners / overflow clipping and composites poorly inside a
      // ScrollView, which leaves the map blank here. TextureView lives in the
      // normal hierarchy, so it scrolls, clips, and rounds correctly.
      androidView="texture"
      dragPan={interactive}
      touchZoom={interactive}
      doubleTapZoom={interactive}
      touchRotate={interactive}
      touchPitch={interactive}
      attribution={false}
      logo={false}
      compass={false}>
      <Camera center={[longitude, latitude]} zoom={zoom} />
      <Marker id="object" lngLat={[longitude, latitude]}>
        <View style={styles.pin} />
      </Marker>
    </Map>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: Brand.blue,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});
