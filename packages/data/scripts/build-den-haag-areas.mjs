// Transforms the raw CBS "buurten 2024" GeoJSON for Den Haag into the compact
// AreaPolygon[] shape consumed by @realty/data.
//
//   - drops the ~200 statistical properties and water-only neighborhoods
//   - reduces coordinate precision to 5 decimals (~1m) to shrink the payload
//   - bakes a per-district (wijkcode) color so neighborhoods group by color
//
// Run from the repo root:  node packages/data/scripts/build-den-haag-areas.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../../data/denhaag_buurten_2024.geojson');
const OUT = resolve(here, '../src/den-haag-areas.json');

// Distinct, readable hues. Districts cycle through these in order of appearance.
const PALETTE = [
  '#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2',
  '#ca8a04', '#dc2626', '#4d7c0f', '#9333ea', '#0d9488', '#be123c',
];

const round = (n) => Math.round(n * 1e5) / 1e5;
const mapCoords = (c) => (Array.isArray(c[0]) ? c.map(mapCoords) : [round(c[0]), round(c[1])]);

const geo = JSON.parse(readFileSync(SRC, 'utf8'));

const districtColor = new Map();
const colorFor = (wijkcode) => {
  if (!districtColor.has(wijkcode)) {
    districtColor.set(wijkcode, PALETTE[districtColor.size % PALETTE.length]);
  }
  return districtColor.get(wijkcode);
};

const areas = geo.features
  .filter((f) => f.properties.water !== 'JA')
  .map((f) => ({
    id: f.properties.buurtcode,
    name: f.properties.buurtnaam,
    color: colorFor(f.properties.wijkcode),
    geometry: { type: f.geometry.type, coordinates: mapCoords(f.geometry.coordinates) },
  }));

writeFileSync(OUT, JSON.stringify(areas));
console.log(`Wrote ${areas.length} areas across ${districtColor.size} districts to ${OUT}`);
