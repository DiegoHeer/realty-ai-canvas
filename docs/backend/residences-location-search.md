# Residences Location Search — Backend Request

**Audience:** backend developer for the Realty Alerts API (`api-staging.realty-ai.nl`,
repo `realty-alerts`).
**Scope:** extend `GET /v1/residences` so the mobile app's search bar can narrow the
**listings feed** (and the map) to a searched location — a place, neighborhood,
street, zipcode, or address. Companion to
[`residences-search-api.md`](./residences-search-api.md) (filters/bbox/envelope, largely
shipped) — this doc covers only the location-search slice and elevates the pieces that
spec parked as P2.

---

## 1. How the app searches (client flow, for context)

The app never sends free text to your API. The search bar geocodes the user's query
client-side via **PDOK Locatieserver** (`apps/mobile/src/lib/pdok.ts`): suggestions as
the user types, and on pick/submit a resolved result

```
{ label: "Biltstraat, Utrecht", type: "weg", longitude: 5.13, latitude: 52.09 }
```

with `type` ∈ `gemeente | woonplaats | wijk | buurt | weg | postcode | adres`.
So by the time the app calls `/v1/residences`, it always holds a **coordinate + a
precision class** — never an unresolved string. The request below follows from that:
we need a *geo* primitive, not server-side text search.

Today the map screen uses this only to fly the camera. The explore/listings feed now
shows the same search bar, but picking a result **cannot narrow the list yet** — that's
the gap this request closes.

## 2. What exists already (current state)

From the live staging OpenAPI + the `realty-alerts` source (all paths under
`services/api/`):

| Capability | State | Where |
|---|---|---|
| `bbox=minLon,minLat,maxLon,maxLat` | ✅ live — four plain lat/lng range filters | `scraping/api.py` (`_parse_bbox`, applied in `list_residences`) |
| `city`, `neighbourhood`, `district`, `street` | ✅ live — `__icontains` substring | `scraping/api.py` (`_apply_text_filters`) |
| `postcode` | ✅ live — `__iexact` full PC6 only | same |
| `neighbourhood_code` (CBS buurt code, repeatable) | ✅ live | `scraping/api.py` |
| Radius filter (`near` + `radius_m`) | ❌ missing | — |
| `sort=distance` | ❌ missing (parked as P2 in `residences-search-api.md` §9) | — |
| PostGIS | not enabled — plain Postgres 17, `latitude`/`longitude` are `FloatField`s with a btree `(lat, lon)` index | `scraping/models.py`, `docker-compose.dev.yml` |

Client-side stopgap to be deleted once this lands: `ListingQuery.search` is applied as a
substring filter over the already-fetched page (`packages/data/src/client.ts`,
"The API has no free-text search, so honor `search` client-side") — it can only ever
filter within one ≤100-item page, so it is not a real search.

## 3. The request

### P0 — radius filter: `near` + `radius_m`

One geo primitive covers **every** search type uniformly (the same argument that made
`bbox` the map's single primitive):

| Param | Type | Semantics |
|---|---|---|
| `near` | string `lon,lat` (WGS84, longitude first — same axis order as `bbox`) | Center of the search. Reuses the `near` param already specified for `sort=distance` in `residences-search-api.md` §9. |
| `radius_m` | int > 0 | Keep residences within this many meters of `near`. Requires `near`; `422` if sent alone. |

The **client picks the radius from the PDOK result type**, mirroring its existing
`zoomForType` camera mapping (`apps/mobile/src/lib/pdok.ts`):

| PDOK `type` | zoom (existing) | suggested `radius_m` |
|---|---|---|
| `gemeente` | 10 | 10 000 |
| `woonplaats` | 12 | 5 000 |
| `wijk` / `buurt` | 14 | 1 500 |
| `weg` | 15 | 600 |
| `postcode` / `adres` | 16 | 300 |

(Radii are client-owned tuning constants — the API just honors whatever is sent.)

**No PostGIS needed.** Follow the existing `bbox` pattern: prefilter with the
`(latitude, longitude)` btree index using the radius's bounding box (±`radius_m`
converted to degrees; lat: `radius_m / 111_320`, lon: divide by `cos(lat)`), then filter
exactly with a Haversine expression (ORM `annotate` with `ACos`/`Sin`/`Cos`/`Radians`,
or raw SQL). At this dataset size the bbox prefilter does all the heavy lifting.
Implementation slots exactly where `bbox` lives: a `_parse_near` helper next to
`_parse_bbox`, applied inline in `list_residences`, params declared as standalone view
args like `bbox`.

`near`+`radius_m` AND-combines with every existing filter (price, building type, …) and
with `bbox` (intersection, though the client won't combine them).

### P0 — `sort=distance`

Search results should list **nearest first** — a `newest`-ordered page of a 5 km circle
buries the searched street. Already fully specified in `residences-search-api.md` §9
(P2 there): `sort=distance` orders by distance to `near` ascending, `422` (or documented
fallback to `newest`) when `near` is absent. The Haversine annotation from the radius
filter doubles as the sort key, so this is nearly free once P0 lands — please deliver
them together.

### P1 — `postcode` prefix matching

Users type zipcodes as `3512`, `3512 AB`, or `3512AB`. Today `postcode` is `__iexact`
on the stored PC6, so partial or spaced variants miss. Requested semantics:

- Normalize both sides (strip spaces, uppercase) and **prefix-match**: `3512` matches
  `3512AB`; `3512AB` matches exactly.
- Keep the param name; this widens matching, additive and backward-safe.

(With P0 shipped this is a nice-to-have — a PDOK `postcode` pick resolves to a
coordinate and goes through `near`. Prefix matching covers users who submit a bare PC4
that PDOK resolves oddly, and any future direct-param callers.)

### P1 — confirm `city` name vocabulary

`Residence.city` is a denormalized string. Please confirm it is the **BAG woonplaats
name** (PDOK returns those, e.g. `Den Haag` vs `'s-Gravenhage` — whichever BAG says).
If so, the client can also send `city=<name>` for `woonplaats` picks as an exactness
upgrade over a fixed radius; if the vocabulary differs, we'll stay radius-only. Just a
one-line answer in the API docs is enough — no code change requested.

### Explicitly not requested

- **Server-side free-text search** (`q`, trigram/`SearchVector`): PDOK already resolves
  text → place client-side, better than the residence table ever could (it knows every
  street/place, handles typos). Listed as a non-goal in `residences-search-api.md` §15;
  that stands.
- **PostGIS**: nothing here needs it. If you'd rather enable it anyway (e.g. for exact
  buurt polygons later), the params above don't change.

## 4. Validation & errors

- `near` not `lon,lat` floats, or out of WGS84 range → `422` (mirror `bbox` handling).
- `radius_m` ≤ 0 or non-int → `422`. Consider a cap (e.g. 50 000) → clamp or `422`.
- `radius_m` without `near` → `422`. `near` alone is fine (it's also the `sort=distance`
  reference point).
- `sort=distance` without `near` → `422` or documented fallback to `newest` — pick one.

## 5. Worked examples

Search "Utrecht" (woonplaats) on the explore feed, default filters, nearest first:

```
GET /v1/residences?api_version=2&deal_type=sale
  &near=5.1214,52.0907&radius_m=5000&sort=distance&limit=50&offset=0
```

Search "Biltstraat, Utrecht" (weg), with active price filter:

```
GET /v1/residences?api_version=2&deal_type=sale&max_price=600000
  &near=5.1301,52.0958&radius_m=600&sort=distance&limit=50
```

Zipcode prefix (P1, non-geo path):

```
GET /v1/residences?api_version=2&postcode=3512&limit=50
```

## 6. OpenAPI delta

```yaml
parameters:
  - { in: query, name: near, required: false,
      schema: { type: string },
      description: 'WGS84 lon,lat. Center for radius_m and reference for sort=distance.' }
  - { in: query, name: radius_m, required: false,
      schema: { type: integer, minimum: 1, maximum: 50000 },
      description: 'Keep residences within this distance (meters) of near. Requires near.' }
  # sort: add 'distance' to the SortOption enum
```

All additions are optional query params with "absent ⇒ no constraint" semantics — no
response-shape change, so **no `api_version` bump** (per `residences-search-api.md`
§10, versioning gates the response shape only).

## 7. Affected client code (our side, FYI)

Once live: `ListingQuery` gains `near`/`radiusM` (`packages/types`),
`buildResidenceParams` maps them (`packages/data/src/client.ts`), the explore screen
wires the search bar's picked result into its query
(`apps/mobile/src/app/(tabs)/explore.tsx` — the `onResult` handler is a documented
no-op pointing at this doc), and the client-side `search` stopgap is deleted.
