import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

// Optional map overlays from Dutch open geodata (the same services Atlas
// Leefomgeving displays). Two shapes:
//  - 'raster': a WMS rendered server-side, consumed as raster tiles via a
//    GetMap template with the {bbox-epsg-3857} token (works in both MapLibre
//    React Native and maplibre-gl). The service picks the colors; `legend`
//    mirrors them, verified against each service's GetLegendGraphic.
//  - 'buildings': PDOK BAG vector tiles styled client-side — building
//    footprints filled by a data-driven expression (see BUILDING_AGE_FILL).
// All services are open data, keyless. WOZ values deliberately have no
// overlay: no open WMS/tile service exists (wozwaardeloket.nl's backend is
// session-gated; an official open service has been requested but not built).

export type OverlayId =
  | 'noise'
  | 'airQuality'
  | 'energyLabels'
  | 'buildingAge'
  | 'zoning'
  | 'treeHeight';

export interface OverlayLegendEntry {
  color: string;
  /** Literal text (a range or class), or an i18n key suffix when `i18n`. */
  label: string;
  /** Translate `label` via `layers.legend.<label>` instead of showing it raw. */
  i18n?: boolean;
}

export interface MapOverlay {
  id: OverlayId;
  kind: 'raster' | 'buildings';
  /** Tile URL template(s) for the MapLibre source. */
  tiles: string[];
  /** Source zoom bounds — outside them no tiles are requested. */
  minzoom?: number;
  maxzoom?: number;
  /** Layer opacity (raster-opacity / fill-opacity). */
  opacity: number;
  /**
   * Camera zoom below which the service draws nothing (building-level layers
   * only render zoomed in) — the legend shows a "zoom in" hint below it.
   */
  visibleFromZoom?: number;
  /** Swatches explaining the layer's colors, in display order. */
  legend: OverlayLegendEntry[];
  /** Unit the legend values are in (dB, µg/m³), shown after the swatches. */
  unit?: string;
}

/** GetMap template MapLibre can treat as a raster tile URL (512px tiles). */
const wmsTiles = (base: string, layer: string): string[] => [
  // PDOK's Mapserver rejects requests without `styles` — always send it empty.
  `${base}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/png&transparent=true`,
];

/**
 * Fill for the building-age overlay: BAG panden bucketed by `bouwjaar` on a
 * viridis ramp (older = darker), readable on both basemaps. The buckets match
 * the overlay's legend entries below.
 */
export const BUILDING_AGE_FILL: ExpressionSpecification = [
  'step',
  ['to-number', ['get', 'bouwjaar'], 0],
  '#440154',
  1900,
  '#414487',
  1945,
  '#2A788E',
  1975,
  '#22A884',
  1990,
  '#7AD151',
  2010,
  '#FDE725',
];

/** Source-layer of the BAG vector tiles carrying the pand polygons. */
export const BAG_PAND_SOURCE_LAYER = 'pand';

export const MAP_OVERLAYS: MapOverlay[] = [
  {
    // RIVM noise map (Lden, all sources, 2020 vintage — newest published).
    id: 'noise',
    kind: 'raster',
    tiles: wmsTiles('https://data.rivm.nl/geo/alo/wms', 'rivm_20220601_Geluid_lden_allebronnen_2020'),
    maxzoom: 18,
    opacity: 0.65,
    unit: 'dB',
    legend: [
      { color: '#FFFFFF', label: '≤45' },
      { color: '#FFFFB2', label: '46–50' },
      { color: '#FFFF00', label: '51–55' },
      { color: '#FFD200', label: '56–60' },
      { color: '#FFA500', label: '61–65' },
      { color: '#FF0000', label: '66–70' },
      { color: '#800000', label: '≥71' },
    ],
  },
  {
    // RIVM annual-mean NO2 — `_actueel` aliases the newest yearly map.
    id: 'airQuality',
    kind: 'raster',
    tiles: wmsTiles('https://data.rivm.nl/geo/alo/wms', 'rivm_jaargemiddeld_NO2_actueel'),
    maxzoom: 18,
    opacity: 0.65,
    unit: 'µg/m³',
    legend: [
      { color: '#305FCF', label: '<10' },
      { color: '#697FCF', label: '10–12' },
      { color: '#97A1CC', label: '12–14' },
      { color: '#BFC3C7', label: '14–16' },
      { color: '#ECEDD2', label: '16–18' },
      { color: '#FAE7AC', label: '18–20' },
      { color: '#F0BC8B', label: '20–25' },
      { color: '#E3926D', label: '25–30' },
      { color: '#D66C51', label: '30–35' },
      { color: '#C44539', label: '35–39' },
      { color: '#B01D1B', label: '≥39' },
    ],
  },
  {
    // RVO energy labels (EP-Online), tiled by RIVM; panden colored by their
    // dominant label. The service only renders at scales below 1:10 000.
    id: 'energyLabels',
    kind: 'raster',
    tiles: wmsTiles('https://data.rivm.nl/geo/nl/wms', 'rvo_energielabels'),
    minzoom: 15,
    opacity: 0.8,
    visibleFromZoom: 15.5,
    legend: [
      { color: '#1A9641', label: 'A+' },
      { color: '#6ABD58', label: 'A' },
      { color: '#B3DF76', label: 'B' },
      { color: '#D2DF76', label: 'C' },
      { color: '#FBFB14', label: 'D' },
      { color: '#FDCC43', label: 'E' },
      { color: '#FF8E15', label: 'F' },
      { color: '#FF4609', label: 'G' },
    ],
  },
  {
    // PDOK BAG vector tiles (OGC API v2 — v1 retires 2026-07-15). The
    // WebMercatorQuad tileset only exists at tile matrix 17; MapLibre overzooms
    // those tiles above that, and below z17 nothing loads. Note the template's
    // {y}/{x} order — OGC tiles address row before column.
    id: 'buildingAge',
    kind: 'buildings',
    tiles: ['https://api.pdok.nl/kadaster/bag/ogc/v2/tiles/WebMercatorQuad/{z}/{y}/{x}?f=mvt'],
    minzoom: 17,
    maxzoom: 17,
    opacity: 0.8,
    visibleFromZoom: 17,
    legend: [
      { color: '#440154', label: '<1900' },
      { color: '#414487', label: '1900–1944' },
      { color: '#2A788E', label: '1945–1974' },
      { color: '#22A884', label: '1975–1989' },
      { color: '#7AD151', label: '1990–2009' },
      { color: '#FDE725', label: '≥2010' },
    ],
  },
  {
    // Kadaster zoning (bestemmingsplannen, Wro vintage — frozen since the
    // 2024 Omgevingswet transition but still the best national zoning map).
    // Legend shows the most common enkelbestemmingen; colors sampled from the
    // service's own legend graphic.
    id: 'zoning',
    kind: 'raster',
    tiles: wmsTiles('https://service.pdok.nl/kadaster/plu/wms/v1_0', 'enkelbestemming'),
    minzoom: 8,
    maxzoom: 18,
    opacity: 0.7,
    legend: [
      { color: '#FFFF00', label: 'residential', i18n: true },
      { color: '#FFC8BE', label: 'centre', i18n: true },
      { color: '#FFBE87', label: 'mixed', i18n: true },
      { color: '#B45FD2', label: 'business', i18n: true },
      { color: '#DC9B78', label: 'public', i18n: true },
      { color: '#28C846', label: 'green', i18n: true },
      { color: '#AFCDE1', label: 'water', i18n: true },
      { color: '#EBF0D2', label: 'agricultural', i18n: true },
      { color: '#CDCDCD', label: 'traffic', i18n: true },
    ],
  },
  {
    // RIVM tree-height map (boomhoogte, AHN-derived, 2022 vintage). The pill
    // is deliberately titled "Sparrows"/"Musjes" — the owner's name for it.
    id: 'treeHeight',
    kind: 'raster',
    tiles: wmsTiles('https://data.rivm.nl/geo/alo/wms', 'rivm_20240101_boomhoogte_2022'),
    maxzoom: 18,
    opacity: 0.65,
    unit: 'm',
    legend: [
      { color: '#FFFFCC', label: '<5' },
      { color: '#C2E699', label: '5–10' },
      { color: '#78C679', label: '10–15' },
      { color: '#31A354', label: '15–20' },
      { color: '#006837', label: '≥20' },
    ],
  },
];

export const overlayById = (id: OverlayId | null | undefined): MapOverlay | null =>
  (id && MAP_OVERLAYS.find((o) => o.id === id)) || null;
