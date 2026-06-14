// Geocoding via PDOK Locatieserver (the Dutch national geocoder).
// The `free` endpoint returns scored documents directly — including a WGS84
// centroid — so a single request resolves a free-text query to a coordinate,
// no separate suggest/lookup round-trip needed.
// https://api.pdok.nl/bzk/locatieserver/search/v3_1/
const BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
const FREE_ENDPOINT = `${BASE}/free`;
const SUGGEST_ENDPOINT = `${BASE}/suggest`;
const LOOKUP_ENDPOINT = `${BASE}/lookup`;

export interface GeocodeResult {
  /** Human-readable name of the matched place, e.g. "Amsterdam, Noord-Holland". */
  label: string;
  longitude: number;
  latitude: number;
  /** PDOK location type, e.g. "woonplaats" | "adres" | "weg" | "wijk" | "buurt". */
  type: string;
}

/** An autocomplete suggestion. Has no coordinates — resolve via {@link lookup}. */
export interface GeocodeSuggestion {
  /** PDOK record id, passed to {@link lookup} to resolve a coordinate. */
  id: string;
  label: string;
  type: string;
}

interface PdokDoc {
  id?: string;
  weergavenaam?: string;
  type?: string;
  centroide_ll?: string;
}

// WKT point as returned in `centroide_ll`, e.g. "POINT(4.897 52.378)" → [lng, lat].
function parsePoint(wkt: string | undefined): [number, number] | null {
  if (!wkt) return null;
  const match = /POINT\(([-\d.]+)\s+([-\d.]+)\)/.exec(wkt);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

/**
 * Resolve a free-text query (city, address, or neighborhood) to its top hit.
 * Returns `null` when nothing matches. Throws on network/HTTP failure so the
 * caller can distinguish "no results" from "the lookup failed".
 */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (!q) return null;

  const url = `${FREE_ENDPOINT}?q=${encodeURIComponent(q)}&rows=1&fl=weergavenaam,type,centroide_ll`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`PDOK Locatieserver responded ${res.status}`);

  const json = (await res.json()) as { response?: { docs?: PdokDoc[] } };
  const doc = json.response?.docs?.[0];
  const point = parsePoint(doc?.centroide_ll);
  if (!doc || !point) return null;

  return {
    label: doc.weergavenaam ?? q,
    longitude: point[0],
    latitude: point[1],
    type: doc.type ?? '',
  };
}

/**
 * Autocomplete suggestions for a partial query, ordered by relevance. The
 * `suggest` endpoint returns no coordinates — call {@link lookup} with a
 * suggestion's `id` once the user picks one. Returns `[]` for a blank query.
 */
export async function suggest(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeSuggestion[]> {
  const q = query.trim();
  if (!q) return [];

  const url = `${SUGGEST_ENDPOINT}?q=${encodeURIComponent(q)}&rows=6&fl=id,weergavenaam,type`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`PDOK Locatieserver responded ${res.status}`);

  const json = (await res.json()) as { response?: { docs?: PdokDoc[] } };
  return (json.response?.docs ?? [])
    .filter((doc): doc is PdokDoc & { id: string } => typeof doc.id === 'string')
    .map((doc) => ({ id: doc.id, label: doc.weergavenaam ?? doc.id, type: doc.type ?? '' }));
}

/**
 * Resolve a suggestion `id` (from {@link suggest}) to a coordinate. Returns
 * `null` when the id is unknown. Throws on network/HTTP failure.
 */
export async function lookup(id: string, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const url = `${LOOKUP_ENDPOINT}?id=${encodeURIComponent(id)}&fl=weergavenaam,type,centroide_ll`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`PDOK Locatieserver responded ${res.status}`);

  const json = (await res.json()) as { response?: { docs?: PdokDoc[] } };
  const doc = json.response?.docs?.[0];
  const point = parsePoint(doc?.centroide_ll);
  if (!doc || !point) return null;

  return {
    label: doc.weergavenaam ?? id,
    longitude: point[0],
    latitude: point[1],
    type: doc.type ?? '',
  };
}

/** A sensible camera zoom for a result, tighter for finer-grained place types. */
export function zoomForType(type: string): number {
  switch (type) {
    case 'adres':
    case 'postcode':
      return 16;
    case 'weg':
      return 15;
    case 'buurt':
    case 'wijk':
      return 14;
    case 'woonplaats':
      return 12;
    default: // gemeente, provincie, …
      return 10;
  }
}
