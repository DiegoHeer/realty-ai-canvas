# Map Overlay Layers — How They Work & How to Add One

**Audience:** anyone adding a new data layer (with its toggle pill) to the map screen.
**Scope:** the overlay system shipped in PR #23 — pill toggles on the map screen that
draw Dutch open-geodata layers (noise, air quality, energy labels, building age, WOZ
value, zoning, tree height) over the basemap, with a legend.

---

## Architecture at a glance

Everything is driven by one registry; the rest of the system renders whatever it finds there.

| Piece | File | Role |
|---|---|---|
| Registry | `apps/mobile/src/lib/map-overlays.ts` | One `MapOverlay` entry per layer: tiles, zoom bounds, opacity, legend, colors |
| Pills | `apps/mobile/src/components/filter-pills.tsx` | Maps over `MAP_OVERLAYS`, one pill + SVG icon per layer, after the divider |
| Legend | `apps/mobile/src/components/overlay-legend.tsx` | Swatch row under the pills; shows a "zoom in" hint below `visibleFromZoom` |
| Map (native) | `apps/mobile/src/components/listing-map.tsx` | `RasterSource`/`VectorSource` + layer via maplibre-react-native |
| Map (web) | `apps/mobile/src/components/listing-map.web.tsx` | Same via react-map-gl, inside the `DataOverlay` component |
| State | `apps/mobile/src/app/(tabs)/index.tsx` | `overlayId` (one active layer or none), `mapZoom` for the legend hint |
| Anchors | `apps/mobile/src/components/map-style.ts` | Per-theme `overlayBeforeId` — the label layer overlays insert below |

Layers come in two shapes (a discriminated union on `kind`):

- **`raster`** — a WMS rendered server-side, consumed as raster tiles. The service picks
  the colors; the registry's `legend` mirrors them.
- **`buildings`** — vector tiles (building footprints) that *we* color with a data-driven
  `fillColor` expression. The legend and the expression must list the same colors — a unit
  test enforces this.

Overlays are **mutually exclusive** (one at a time), toggled by tapping the active pill
again, and deliberately **not persisted** — `overlayId` is plain screen state.

## Adding a new layer, step by step

### 1. Find and verify the data source

You need one of:

- A **WMS** that supports `EPSG:3857` (check `GetCapabilities`), is keyless, and allows
  CORS. RIVM (`data.rivm.nl/geo/alo/wms`, `data.rivm.nl/geo/nl/wms`) and PDOK
  (`service.pdok.nl/...`) both qualify. Atlas Leefomgeving is a good catalog — its layers
  are mostly RIVM WMS services you can use directly.
- **XYZ vector tiles** (`/{z}/{x}/{y}.pbf`) with a known source-layer, if you want to
  color buildings yourself.

Verify with a live probe before writing any code, at the zoom you expect users to view it:

```bash
curl -s 'https://data.rivm.nl/geo/alo/wms?service=WMS&request=GetCapabilities' | grep -i '<Name>your_layer'
```

**⚠ Scale-gated WMS.** A layer can be listed, return HTTP 200, and still paint *nothing*:
several services only render below a max scale denominator and return **fully transparent
PNGs** above it. PDOK's `enkelbestemming` (zoning) is empty until ~1:25 000 — z13 with our
512px tiles. A screenshot can't distinguish "broken" from "transparent by design", so
probe the actual pixels: fetch a GetMap URL for a few tile-sized bboxes at different zooms
and count nonzero-alpha pixels (decode with `createImageBitmap` + canvas, or any PNG
library). Whatever zoom the pixels start at becomes `minzoom`/`visibleFromZoom`.

**⚠ Vector-tile zoom coverage.** PDOK's own BAG vector tiles only publish tile matrix 17
— useless for city-scale coloring (this is why building age originally "didn't load").
Building age and WOZ use Walter Living's tileset instead
(`tiles.walterliving.com/data/buildings/{z}/{x}/{y}.pbf`, source-layer `buildings`,
fields `construction_year`, `energy_label`, `woz_value`, `function`), which serves z0–18
with open CORS. Caveat recorded in the registry: it's private infrastructure with no SLA,
but rebuildable from public data (BAG + EP-Online + WOZ-waardeloket) if it ever closes.

### 2. Get the exact legend colors

The in-app legend must match what the service actually draws — don't guess from
eyeballing the map:

- Most GeoServer WMSes (RIVM) support
  `request=GetLegendGraphic&format=application/json`, which returns the style's exact
  hex colors and class boundaries.
- PDOK's Mapserver only serves a legend **PNG** — download it and sample the swatch
  pixels programmatically (that's where the zoning colors came from).

For `buildings` overlays you choose the ramp yourself (building age uses viridis, WOZ a
yellow→red ramp) — put the same hexes in `fillColor` and `legend`.

### 3. Add the registry entry

Extend the `OverlayId` union and append to `MAP_OVERLAYS` in
`apps/mobile/src/lib/map-overlays.ts`. For a WMS layer, use the `wmsTiles()` helper —
it builds a GetMap URL that MapLibre treats as a tile template. Details it encodes:

- `bbox={bbox-epsg-3857}` — the token MapLibre substitutes per tile; this is what turns
  a WMS into a "tile" server.
- `width=512&height=512` matching the `tileSize={512}` the map components pass — mismatch
  gives blurry or misregistered tiles.
- An explicit **empty `styles=` param** — PDOK's Mapserver errors without it (GeoServer
  doesn't care, so always send it).

Key per-entry decisions:

- `opacity` — rasters wash over everything; 0.65–0.8 keeps the basemap readable.
- `minzoom`/`maxzoom` — source bounds; below `minzoom` no tiles are even requested
  (spares scale-gated services pointless empty fetches).
- `visibleFromZoom` — where the layer becomes *usefully visible*; below it the legend
  shows the "Zoom in to see this layer" hint instead of swatches. Set it for anything
  building-level (energy labels 15.5, building age/WOZ 12, zoning 13).
- `unit` — trailing text after the swatches (dB, µg/m³, m).
- Legend labels are literal ranges by default; set `i18n: true` on an entry to translate
  it via `layers.legend.<label>` (used for words like "Residential"/"no data").

### 4. i18n

Add the pill title under `layers.<id>` in **all three** locale files
(`packages/i18n/src/locales/{en,nl,pt}.json`), plus any `layers.legend.*` keys you
introduced. The locale-completeness test fails the build if one language misses a key.

### 5. Pill icon

In `filter-pills.tsx`, add a stroked SVG icon component (Feather/Lucide style, 24×24
viewBox, `strokeWidth={2}`, drawn with `react-native-svg` so it's identical on
web/iOS/Android) and register it in `OVERLAY_ICONS`. The pill row itself needs no other
change — it maps over the registry.

### 6. Tests

- `apps/mobile/src/__tests__/map-overlays.test.ts` validates the registry shape (unique
  ids, WMS template tokens, legend/fill color parity for `buildings` overlays, valid hex)
  — a new entry is covered automatically, but run it: registry mistakes surface here.
- `apps/mobile/src/__tests__/screens/map.test.tsx` covers toggling, legend swap, and the
  zoom hint. RNTL v14: `await render(...)`, and wrap post-press assertions in
  `await waitFor(...)`.
- The maplibre mock in `apps/mobile/test-setup.ts` already stubs
  `RasterSource`/`VectorSource` (as children-passthroughs) — extend it if you use a new
  source component.

Run with `bun run test` (never bare `bun test` — Bun's own runner chokes on RN Flow types).

## Map-rendering details that will bite you

These are encoded in the components' comments, but here's the why:

**Unique source/layer ids per overlay.** Both platforms render
`overlay-${id}` / `overlay-${id}-raster|-buildings`. With a single shared id, switching
overlays races React's mount/unmount order: the incoming layer is created *during render*,
before the outgoing source's cleanup effect runs, so it attaches to the wrong source (or
react-map-gl updates the old source in place with the wrong type/zoom bounds). Symptom:
`layer "…" requires a vector source` console errors and tiles requested with wrong-zoom
bboxes.

**Layer ordering (`beforeId`).** Overlays insert *above* the basemap's `building` fill
but *below* the first label layer, so text stays readable over the wash. The anchor layer
differs per theme (`waterway_line_label` light, `highway_name_other` dark — the vendored
styles share **no** layer ids) and lives in `map-style.ts` as `overlayBeforeId`. The
choropleth polygons use a different anchor (`building`) — don't reuse it for overlays or
the basemap's buildings will paint over your data.

**Theme switches (web).** Two races, two fixes, both in `listing-map.web.tsx`:

1. `styleDiffing={false}` on the `<Map>` — the light/dark styles are entirely different
   documents, and letting MapLibre diff them tries to remove the overlay's source while
   its layer still uses it. A full style reload lets react-map-gl re-add everything cleanly.
2. The `DataOverlay` component resolves `beforeId` against the **live** style
   (`map.getLayer(anchor)`, re-checked on `styledata`). react-map-gl calls `moveLayer`
   the instant the `beforeId` prop changes, but during a theme switch the new theme's
   anchor doesn't exist yet in the still-current style → `Cannot move layer … before
   non-existing layer`. Passing the anchor only once it exists lets the layer float
   unanchored for the swap (invisible under the reload) and re-anchor when the new style
   lands.

Native (maplibre-react-native) manages style swaps itself and needs neither.

**The legend's zoom hint needs the camera zoom.** `index.tsx` tracks `mapZoom` from
`onCameraIdle` and hands it to `OverlayLegend`; if you add a new map interaction that
changes zoom without an idle event, the hint can go stale.

## Verifying in the browser

`bun run web -p <port>` + Playwright (see the `verifier-web` skill). The map is a WebGL
canvas — you can't assert on DOM. What works:

- **Network**: filter requests for your tile URL; check they fire when the pill activates
  and *stop* below `minzoom`.
- **Pixels**: screenshot and look for the wash/colors; remember transparent-200 services
  make "no wash" ambiguous — probe tiles directly (step 1) before blaming the layer.
- **Style introspection**: reach the MapLibre instance via the React fiber of
  `.maplibregl-map` (walk *down* to the `MapContext` provider's `value.map.getMap()`),
  then assert `map.getStyle().layers` order — the overlay layer should sit immediately
  before its anchor — and drive the camera with `map.jumpTo` to test zoom gates.
- **Console**: cycle every pill and switch themes both directions with a layer active;
  zero MapLibre errors is part of done.
