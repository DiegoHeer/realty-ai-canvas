# Shapes API — geometry `format` parameter (Backend Spec)

**Audience:** backend developer for the Realty Alerts API (`api-staging.realty-ai.nl`).
**Scope:** add one optional, additive query parameter — `format` — to the shapes
**list** endpoints, so the geometry encoding becomes an explicit part of the request
contract. This is a forward-compatibility move only: **nothing about today's responses
changes.** Companion to [`residences-search-api.md`](./residences-search-api.md) — see its
[§10 versioning](./residences-search-api.md#10-versioning-migration--compatibility) for the
compatibility philosophy this follows.

Affected endpoints:

| Endpoint | Summary |
|---|---|
| `GET /v1/shapes/cities` | List City Shapes |
| `GET /v1/shapes/neighborhoods` | List Neighborhood Shapes |

> **Out of scope:** `GET /v1/shapes/districts` is intentionally deferred here — it should
> adopt the **same** `format` param when it's wired into the client; treat the contract
> below as the template for it.

---

## The parameter

| Name | In | Type | Required | Default | Values |
|---|---|---|---|---|---|
| `format` | query | string (enum) | no | `geojson` | `geojson` (today), `topojson` (reserved) |

This mirrors the **locked `deal_type` decision** in the residences spec: *ship the flag
now for forward-compatibility, but only the current value is served.* Here `geojson` is the
only value implemented today; `topojson` is reserved for a future release.

## Behaviour today

- `format=geojson` **or omitted** → the **current response, byte-for-byte unchanged**: a
  JSON array of shape objects whose `geometry` is bare GeoJSON coordinates — a Polygon's
  `Position[][]` or a MultiPolygon's `Position[][][]` (nested one level deeper). The client
  infers which from the nesting depth, so keep emitting bare coordinates with **no** `type`
  field.
- `format=topojson` → not implemented yet. **Reject it:** `422 Unprocessable Entity` (same
  validation path as other bad enum values in
  [§11](./residences-search-api.md#11-validation--errors)), or `501 Not Implemented` if you
  prefer to signal "valid value, not built yet." Do **not** silently fall back to GeoJSON —
  a client that asked for TopoJSON cannot parse a GeoJSON body.
- Any other value (e.g. `format=kml`) → `422`.

The shipped mobile client always sends `format=geojson` on both endpoints (see
`packages/data/src/client.ts`, the `GEOM_FORMAT` constant), so it never reaches the reject
paths above.

## The forward-compatibility guarantee (please keep)

**The default must stay `geojson` forever.** Adding `topojson` later must be strictly
opt-in — clients ask for it explicitly. Flipping the default, or returning TopoJSON to any
request that didn't ask for it, is a **breaking change**: every already-installed app only
decodes GeoJSON and would silently render no overlays. This is the same "a new backend must
not break an old app" rule as residences
[§10](./residences-search-api.md#10-versioning-migration--compatibility); the explicit
`format=geojson` the client now sends is exactly what pins it safely against a future
default change.

## When `topojson` lands (future — not part of this change)

TopoJSON is a single *topology* object with shared, quantized arcs — structurally different
from today's per-feature coordinate arrays, and typically much smaller for dense boundary
sets (e.g. all neighborhoods of a city). It will need:

- its own response schema (a `Topology` object, not an array of features), and
- a client-side decoder (today's `toAreaGeometry` only understands GeoJSON coordinates).

Both are out of scope here; this spec only reserves the `format` value so the wire contract
is ready for them.

## OpenAPI delta (drop-in)

Add to `GET /v1/shapes/cities` and `GET /v1/shapes/neighborhoods`:

```yaml
parameters:
  - in: query
    name: format
    required: false
    schema:
      $ref: '#/components/schemas/GeomFormat'
    description: >
      Geometry encoding of the response. `geojson` (default) returns bare GeoJSON
      coordinate arrays, as today. `topojson` is reserved for a future release and
      currently returns 422.
```

New schema:

```yaml
GeomFormat:
  type: string
  enum: [geojson, topojson]   # only `geojson` served today
  default: geojson
```
