import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

// Optional map overlays from Dutch geodata (mostly the services Atlas
// Leefomgeving displays). Two shapes:
//  - 'raster': a WMS rendered server-side, consumed as raster tiles via a
//    GetMap template with the {bbox-epsg-3857} token (works in both MapLibre
//    React Native and maplibre-gl). The service picks the colors; `legend`
//    mirrors them, verified against each service's GetLegendGraphic.
//  - 'buildings': vector tiles styled client-side — building footprints
//    filled by the overlay's own data-driven `fillColor` expression.
// The RIVM/PDOK services are open data, keyless. Building age and WOZ come
// from Walter Living's tileset (see WALTER_BUILDINGS_TILES below).

export type OverlayId =
  | 'noise'
  | 'airQuality'
  | 'energyLabels'
  | 'buildingAge'
  | 'wozValue'
  | 'zoning'
  | 'treeHeight';

export interface OverlayLegendEntry {
  color: string;
  /** Literal text (a range or class), or an i18n key suffix when `i18n`. */
  label: string;
  /** Translate `label` via `layers.legend.<label>` instead of showing it raw. */
  i18n?: boolean;
}

interface OverlayBase {
  id: OverlayId;
  /** Tile URL template(s) for the MapLibre source. */
  tiles: string[];
  /** Source zoom bounds — outside them no tiles are requested. */
  minzoom?: number;
  maxzoom?: number;
  /** Layer opacity (raster-opacity / fill-opacity). */
  opacity: number;
  /**
   * Camera zoom below which the layer draws nothing (building-level layers
   * only render zoomed in) — the legend shows a "zoom in" hint below it.
   */
  visibleFromZoom?: number;
  /** Swatches explaining the layer's colors, in display order. */
  legend: OverlayLegendEntry[];
  /** Unit the legend values are in (dB, µg/m³), shown after the swatches. */
  unit?: string;
}

/** Server-rendered raster tiles (WMS) — the service picks the colors. */
interface RasterOverlay extends OverlayBase {
  kind: 'raster';
}

/** Vector building footprints we color ourselves. */
interface BuildingsOverlay extends OverlayBase {
  kind: 'buildings';
  /** The vector tiles' source-layer holding the building polygons. */
  sourceLayer: string;
  /** Data-driven fill matching `legend`'s buckets. */
  fillColor: ExpressionSpecification;
}

export type MapOverlay = RasterOverlay | BuildingsOverlay;

/** GetMap template MapLibre can treat as a raster tile URL (512px tiles). */
const wmsTiles = (base: string, layer: string): string[] => [
  // PDOK's Mapserver rejects requests without `styles` — always send it empty.
  `${base}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/png&transparent=true`,
];

// Building-level vector tiles from Walter Living (walterliving.com) — one
// `buildings` source-layer of BAG pand footprints joined with BAG's
// construction year, the pand's EP-Online energy label and its WOZ value
// (fields: id, construction_year, energy_label, woz_value, function).
// Available z0–18 with open CORS, so building coloring works from city zooms
// — unlike PDOK's own BAG vector tiles, which only publish tile matrix 17.
// CAVEAT: this is Walter's private tile server, not an official open-data
// service — no SLA, could change or close at any time. The underlying data is
// all public (BAG, EP-Online, WOZ-waardeloket), so the same tileset can be
// rebuilt and self-hosted if it ever breaks (their TileJSON documents the
// tippecanoe invocation).
const WALTER_BUILDINGS_TILES = ['https://tiles.walterliving.com/data/buildings/{z}/{x}/{y}.pbf'];
const WALTER_SOURCE_LAYER = 'buildings';

/**
 * Fill for the building-age overlay: panden bucketed by construction year on
 * a viridis ramp (older = darker), readable on both basemaps. The buckets
 * match the overlay's legend entries below. Missing/placeholder years (BAG
 * uses 1005 for "unknown, old") land in the darkest bucket.
 */
const BUILDING_AGE_FILL: ExpressionSpecification = [
  'step',
  ['to-number', ['get', 'construction_year'], 0],
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

/**
 * Fill for the WOZ overlay: panden bucketed by WOZ value (€) on a
 * yellow→red ramp (pricier = redder); buildings without a value (≈4%,
 * mostly non-residential) fill neutral gray, matching the "no data" swatch.
 */
const WOZ_FILL: ExpressionSpecification = [
  'case',
  ['!', ['has', 'woz_value']],
  '#E2E2E2',
  [
    'step',
    ['to-number', ['get', 'woz_value'], 0],
    '#FFFFB2',
    300000,
    '#FECC5C',
    500000,
    '#FD8D3C',
    750000,
    '#F03B20',
    1000000,
    '#BD0026',
  ],
];

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
    // BAG construction year per pand, from the Walter Living tileset. Tiles
    // exist from z0, but tippecanoe drops the tiny footprints at low zooms —
    // the fills only read at city scale, so gate at z12 (also spares their
    // server country-wide requests).
    id: 'buildingAge',
    kind: 'buildings',
    tiles: WALTER_BUILDINGS_TILES,
    sourceLayer: WALTER_SOURCE_LAYER,
    fillColor: BUILDING_AGE_FILL,
    minzoom: 12,
    maxzoom: 18,
    opacity: 0.8,
    visibleFromZoom: 12,
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
    // WOZ value per pand, same Walter Living tileset. There is no official
    // open WOZ map service (wozwaardeloket.nl's backend is session-gated);
    // Walter compiled the public per-address values into these tiles.
    id: 'wozValue',
    kind: 'buildings',
    tiles: WALTER_BUILDINGS_TILES,
    sourceLayer: WALTER_SOURCE_LAYER,
    fillColor: WOZ_FILL,
    minzoom: 12,
    maxzoom: 18,
    opacity: 0.8,
    visibleFromZoom: 12,
    legend: [
      { color: '#FFFFB2', label: '<€300k' },
      { color: '#FECC5C', label: '€300–500k' },
      { color: '#FD8D3C', label: '€500–750k' },
      { color: '#F03B20', label: '€750k–1M' },
      { color: '#BD0026', label: '≥€1M' },
      { color: '#E2E2E2', label: 'noData', i18n: true },
    ],
  },
  {
    // Kadaster zoning (bestemmingsplannen, Wro vintage — frozen since the
    // 2024 Omgevingswet transition but still the best national zoning map).
    // The WMS is scale-gated: below ~1:25 000 (512px tiles up to z12) it
    // returns fully transparent images, so only request from z13 and show the
    // zoom hint above it. Legend shows the most common enkelbestemmingen;
    // colors sampled from the service's own legend graphic.
    id: 'zoning',
    kind: 'raster',
    tiles: wmsTiles('https://service.pdok.nl/kadaster/plu/wms/v1_0', 'enkelbestemming'),
    minzoom: 13,
    maxzoom: 18,
    opacity: 0.7,
    visibleFromZoom: 13,
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
