# Residences Search API — Backend Spec

**Audience:** backend developer for the Realty Alerts API (`api-staging.realty-ai.nl`).
**Scope:** extend `GET /v1/residences` so the mobile app can drive map + list search
entirely server-side: full filtering, geographic (bbox) queries, sorting, and
paginated results with a total count. The `/v1/shapes/*` and `/v1/stats/*`
endpoints are **unchanged**.

---

The four product decisions below are **locked**. Everything else (including the
versioning mechanism in §10) is implementation guidance — deviate where you have a
better backend reason, but keep the request/response contract.

**Delivery order:** see [§0](#0-delivery-priorities-mvp-first) — the MVP (P0) is `bbox` +
core residence-level filters + the paginated envelope; the listing-level filters
(bed/bath/area/year) and all sorting are P1+.

### Locked decisions

| Question | Decision |
|---|---|
| Buy vs. rent | Add a `deal_type` flag now for forward-compatibility, but **only `sale` is populated/served today**. The app's Buy/Rent toggle maps buy→`sale`, rent→`rent`; `rent` returns an empty page until rental data exists. |
| Neighborhood ("buurt") tap precision | **Bounding box** is acceptable — one geo primitive (`bbox`) serves both tap and pan. Exact per-buurt filtering is a future refinement (see [§5](#5-geographic-queries-bbox)). |
| "Newest / oldest" sort field | Residence **`created_at`** (when we first saw it). |
| Result counts | **Envelope with `total`** (`{ items, total, limit, offset, has_more }`). |

---

## 0. Delivery priorities (MVP first)

Ship in tiers. **P0 is the minimal working version** for first delivery; P1 is the
fast-follow; P2 is later/nice-to-have. The priorities track implementation cost: the main
seam is **residence-level** attributes (filter/sort directly, no schema work) vs.
**listing-level** ones (`bedrooms`, `bathrooms`, `area`, `build year` — these need the
denormalization in [§6](#6-listing-level-filters--denormalization)).

### P0 — MVP: load homes by map area, with core filters, without overflooding

1. **`bbox` geo query** ([§5](#5-geographic-queries-bbox)) — powers both *tap a
   neighborhood* and *pan to load*. The headline capability; if the map can't load by
   area, nothing else matters.
2. **Paginated envelope** `{ items, total, limit, offset, has_more }`
   ([§4](#4-response-envelope)), gated by **`api_version=2`** with **absent ⇒ legacy
   array** ([§10](#10-versioning-migration--compatibility)). `total` gives the truthful
   "Show N homes" badge; `has_more` + a `limit` cap is what prevents overflooding.
   (`limit`/`offset` already exist.)
3. **Residence-level filters only** (no denormalization): `min_price`/`max_price`
   (already live), **`building_type`** (multi), and the existing `status`.
   `energy_label` ([§7](#7-energy-label-multi-select-filter)) is also residence-level and
   cheap — include it if convenient, otherwise P1.
4. **`deal_type`** defaulting to `sale` — near-zero cost, reserves buy/rent forward-compat.
5. **A fixed default order** (`created_at DESC, id DESC`) for stable pagination — the
   user-switchable `sort` param itself is P1.
6. **Versioning discipline**: send `api_version`, keep new params additive, default
   absent→legacy. (The lifecycle extras are P2.)

> **Transitional note:** in P0 the app can keep applying the not-yet-server-side facets
> (bed/bath/area/year) **client-side over the bbox-bounded marker set** (small by
> construction). The paginated *list* in P0 relies only on the server-side filters above;
> client-side filtering is removed once P1 lands.

### P1 — Fast follow: complete the filters + basic sort

- **Listing-level filters** ([§6](#6-listing-level-filters--denormalization)):
  `min_bedrooms`, `min_bathrooms`, `min_area_m2`/`max_area_m2`, `min_build_year`. This is
  the main schema work (denormalize representative values onto the residence).
- **`sort=newest|oldest`** ([§9](#9-sorting--pagination)) — user-switchable order
  (lower priority per product decision).
- **`limit=0` count-only** request for the badge ([§4](#4-response-envelope)).

### P2 — Later / nice-to-have

- **Advanced sorts**: `price_asc`/`price_desc`, `area_asc`/`area_desc`,
  `price_per_m2_asc`, `distance` (+ `near`) ([§9](#9-sorting--pagination)).
- **Versioning lifecycle**: `Deprecation`/`Sunset` headers, `min_supported_api_version` /
  a `/v1/meta` endpoint, version telemetry ([§10](#10-versioning-migration--compatibility)).
- **Exact per-buurt filtering** via `neighbourhood_code` — bbox is the accepted MVP
  ([§5](#5-geographic-queries-bbox)).
- **Clustering, free-text search, and rent data** ([§15](#15-non-goals-explicitly-out-of-scope)).

The [§3 parameter table](#3-full-parameter-reference) and detail sections describe
*everything*; this section governs only the **order of delivery**.

---

## 1. Current state (for reference)

`GET /v1/residences` today accepts: `city`, `neighbourhood`, `district`, `street`,
`postcode` (free strings), `min_price`, `max_price`, `status`
(`new|sale_pending|sold`), `limit` (default 20, **max 100**), `offset` (default 0).
It returns a **bare JSON array** of `ResidenceOut` — there is no total count.

The mobile client currently sends only `min_price`/`max_price`/`status`/`limit=100`
and applies **every other filter client-side** over that single ≤100-item page. As a
result the map silently shows at most 100 homes, never paginates, and can't query by
map region. This spec moves all of that to the server.

### Where each attribute lives in the data model

This is the crux of the implementation, because the filterable attributes are split
across two tables:

| Lives on the **residence** (cheap to filter/sort/index) | Lives on each **source listing** (`listings[]`, needs aggregation) |
|---|---|
| `current_price_eur`, `current_status`, `building_type`, `energy_label`, `latitude`, `longitude`, `city`/`neighbourhood`/`district`/`postcode`, `created_at`, `status_changed_at` | `surface_area_m2`, `bedroom_count`, `bathroom_count`, `room_count`, `construction_period` |

So **bedrooms, bathrooms, area, and build year are per-source-listing**, while a
residence can have several source listings. See [§6](#6-listing-level-filters--denormalization)
for how to resolve that — it's the single most important implementation choice here.

---

## 2. Endpoint

```
GET /v1/residences
```

Same path. New query params, new response envelope. All params are optional and
**AND-combine** (a residence must satisfy every supplied filter). Repeated values of a
multi-value param **OR-combine** within that param.

---

## 3. Full parameter reference

Legend: **E** = exists today · **N** = new · **C** = changed.

| Param | | In | Type | Default | Constraints | Maps to app filter | Semantics |
|---|---|---|---|---|---|---|---|
| `api_version` | N | query | int | `1` (legacy) | `1` or `2` | — | Response contract the client speaks. **Absent/`1` ⇒ bare array (legacy)**, `2` ⇒ `ResidencePage` envelope. Sent automatically on every request; controls the **response shape only**. See [§10](#10-versioning-migration--compatibility). |
| `deal_type` | N | query | enum `sale\|rent` | `sale` | — | `Filters.mode` (buy→`sale`, rent→`rent`) | Transaction kind. Only `sale` is populated now; `rent` returns an empty page. Orthogonal to `status`. |
| `min_price` | E | query | int | — | ≥ 0 | `Filters.minPrice` | Inclusive lower bound on `current_price_eur`. |
| `max_price` | E | query | int | — | ≥ 0 | `Filters.maxPrice` | Inclusive upper bound on `current_price_eur`. |
| `building_type` | N | query | enum, **repeatable** | — | `apartment\|terraced\|corner\|semi_detached\|detached` | `Filters.propertyTypes[]` | Residence's `building_type` ∈ supplied set. Repeat the param to OR several (`building_type=apartment&building_type=terraced`). Omitted = any. Also accept CSV as a fallback. |
| `min_bedrooms` | N | query | int | — | ≥ 0 | `Filters.minBedrooms` | Inclusive lower bound on bedrooms. Listing-level — see [§6](#6-listing-level-filters--denormalization). |
| `min_bathrooms` | N | query | int | — | ≥ 0 | `Filters.minBathrooms` | Inclusive lower bound on bathrooms. Listing-level. |
| `min_area_m2` | N | query | int | — | ≥ 0 | `Filters.minAreaSqm` | Inclusive lower bound on living area. Listing-level. |
| `max_area_m2` | N | query | int | — | ≥ 0 | `Filters.maxAreaSqm` | Inclusive upper bound on living area. Listing-level. |
| `energy_label` | N | query | enum, **repeatable** | — | see [§7](#7-energy-label-multi-select-filter) | `Filters.energyLabels[]` | Residence's `energy_label` ∈ supplied set. Repeat to OR several (`energy_label=A&energy_label=B`). Omitted = any. CSV fallback accepted. Mirrors `building_type`. |
| `min_build_year` | N | query | int | — | e.g. 1900–2100 | `Filters.minBuildYear` | Keeps residences built in/after this year. Parsed from `construction_period`. Listing-level — see [§8](#8-build-year-filter). |
| `bbox` | N | query | string `minLon,minLat,maxLon,maxLat` | — | 4 WGS84 floats; lat∈[-90,90], lon∈[-180,180] | map viewport / tapped polygon | Keep residences whose point falls in the box. Implies geocoded-only. See [§5](#5-geographic-queries-bbox). |
| `sort` | N | query | enum | `newest` | see [§9](#9-sorting--pagination) | list sort control | One of `newest`/`oldest`/`price_asc`/`price_desc`/`area_asc`/`area_desc`/`price_per_m2_asc`/`distance`; each maps to a defined `ORDER BY` (§9). |
| `near` | N | query | string `lon,lat` | — | WGS84, longitude first | map center / search point | Reference point required by `sort=distance`; ignored otherwise. See [§9](#9-sorting--pagination). |
| `status` | E | query | enum `new\|sale_pending\|sold` | — | (not in filters UI) | Optional sale-lifecycle sub-filter. The app does **not** send this today (the map intentionally shows new/pending/sold), but keep it available. |
| `city` `neighbourhood` `district` `street` `postcode` | E | query | string | — | | | Existing text filters — keep as-is. Not used by the new map flow (bbox supersedes them) but harmless. |
| `limit` | C | query | int | 20 | **0**–100 | pagination | Page size. **Lower the minimum to 0** so a count-only request (`limit=0`) returns `items: []` with a computed `total` for the badge. Max stays 100. |
| `offset` | E | query | int | 0 | ≥ 0 | pagination | Rows to skip. |

> **No filter supplied for a facet ⇒ no constraint on that facet.** This mirrors the
> app, where `null`/empty/`0` all mean "any" (`DEFAULT_FILTERS` is the unfiltered state).

---

## 4. Response envelope

When the client requests `api_version=2`, return a paged envelope instead of the bare
array (absent/`api_version=1` keeps the legacy array — see
[§10](#10-versioning-migration--compatibility)). New schema `ResidencePage`:

```jsonc
{
  "items": [ /* ResidenceOut[] — unchanged item schema, ≤ limit of them */ ],
  "total": 142,      // total residences matching the filters, ignoring limit/offset
  "limit": 50,       // echo of the effective limit
  "offset": 0,       // echo of the effective offset
  "has_more": true   // offset + items.length < total
}
```

- `total` is the exact count of the filtered set (the same `WHERE` clause as `items`,
  without `LIMIT`/`OFFSET`). It drives the **"Show 142 homes"** badge and tells the
  infinite-scroll list when to stop.
- The **`ResidenceOut` item schema does not change** — only the top-level wrapper does.
- **Count-only call**: `limit=0` returns `items: []` and the computed `total`. The
  filters screen uses this to refresh the badge cheaply as the user edits, without
  fetching a page of homes.

---

## 5. Geographic queries (`bbox`)

**Priority: P0 (MVP)** — see [§0](#0-delivery-priorities-mvp-first).

A single primitive serves both new map requirements.

**Format:** `bbox=minLon,minLat,maxLon,maxLat` — four WGS84 decimal degrees, longitude
first. This is GeoJSON bbox order and exactly matches the app's existing `Bounds` type
(`[minLng, minLat, maxLng, maxLat]`), so the client passes it through directly.

**Filter:** keep residences where
`latitude BETWEEN minLat AND maxLat AND longitude BETWEEN minLon AND maxLon`,
and `latitude`/`longitude` are non-null. A `bbox` query is implicitly **geocoded-only**
(a residence with no coordinates can't be on the map).

**Two client flows, one param:**
- **Pan the map** → client debounces viewport changes (~300–500 ms) and re-requests
  with the visible region's `bbox` + the active filters + `sort`.
- **Tap a neighborhood polygon** → client sends that polygon's **bounding box** as
  `bbox` (per the locked decision). The box of an irregular buurt includes a little of
  its neighbors; that's accepted for now.

**Caps & guards:**
- The client will cap markers via `limit` (e.g. 200) and rely on `total` to show a
  "zoom in to see all N homes" hint. Honor `limit` as the hard ceiling.
- Consider rejecting an absurdly large `bbox` (e.g. spanning the whole country) with
  `422`, or just let the spatial index + `limit` bound the cost — your call.

**Indexing:** if PostGIS is available, store a `geography(Point, 4326)` and use a GiST
index with `ST_MakeEnvelope(minLon, minLat, maxLon, maxLat, 4326)` / `ST_Intersects`.
Otherwise a composite B-tree on `(latitude, longitude)` with range predicates is fine
at this dataset size.

**Future precision (not required now):** to make a buurt tap *exact*, add a
`neighbourhood_code` filter keyed to the CBS buurt code (the same `code` the
`/v1/shapes/neighborhoods` polygons carry, which is the polygon `id` the app already
holds on tap). That requires residences to store the CBS code — see
[Open questions](#16-open-questions-for-the-backend-team).

---

## 6. Listing-level filters & denormalization

**Priority: P1** — this denormalization is the main gating work for the listing-level
filters; **not required for the P0 MVP** (see [§0](#0-delivery-priorities-mvp-first)).

`min_bedrooms`, `min_bathrooms`, `min_area_m2`/`max_area_m2`, and `min_build_year` all
target attributes that live on **`listings[]`**, not the residence. A residence can
carry multiple source listings (e.g. the same home on Funda and Pararius) whose values
may differ.

**Recommended approach — denormalize a representative value onto the residence:**

Pick one representative listing per residence and copy its display attributes
(`surface_area_m2`, `bedroom_count`, `bathroom_count`, `room_count`, and a parsed
`build_year`) onto the residence row, refreshed whenever its listings change. Filter
and sort on those residence-level columns.

Selection rule (mirror what the app shows today so **filters match the card the user
sees**): the app's adapter picks *"the first source listing that reports a living area,
else the first listing"* (`packages/data/src/residences.ts` → `residenceToListing`).
Reproduce that, or define an equivalent deterministic rule (e.g. most-recently-seen
active listing). Document whichever you choose.

Why denormalize:
- **Consistency** — the value you filter on is the value rendered on the card. An
  "any listing matches" approach can return a home whose *displayed* size doesn't meet
  the filter, which looks like a bug to users.
- **Performance** — plain indexed columns instead of a per-request join/aggregate.

**Fallback if you can't denormalize now:** evaluate each listing-level filter as
"residence matches if its representative listing matches" (not "any listing"), to keep
the same consistency guarantee. Avoid "any listing matches any filter" — combining
`min_bedrooms` from one listing with `min_area_m2` from another produces phantom matches.

**Null handling:** if the representative value is unknown (null), treat the residence as
**not matching** when that filter is set (you can't prove it qualifies). This matches
the app's current behavior.

---

## 7. Energy label (multi-select filter)

`energy_label` is a **repeatable** enum (like `building_type`): the user picks the set of
acceptable labels in the filters menu, and a residence matches if its `energy_label` is
**in that set**. Repeat the param to OR several
(`energy_label=A&energy_label=B&energy_label=C`); omitted = any; CSV accepted as a fallback.
A residence with a **null** `energy_label` does **not** match when the filter is set.

The API's `EnergyLabel` enum, best → worst:

```
A+++++  A++++  A+++  A++  A+  A  B  C  D  E  F  G
```

> The filter is plain **set membership**, so the ordinal order above isn't needed to
> evaluate it — but it's still what the optional **energy-efficiency sort**
> (P2, [§9](#9-sorting--pagination)) would rank by. Note the app's local list
> (`apps/mobile/src/lib/filters.ts` → `ENERGY_LABELS`) omits `A++++`/`A+++++`, but the
> client may send any of the 12 values, so validate against the full enum.

---

## 8. Build-year filter

`min_build_year` keeps residences built in/after the given year. The source value is the
free-form `construction_period` string (e.g. `"1973"`, possibly `"1920-1940"` or prose).

- Parse a 4-digit year from it. Mirror the app's parser
  (`apps/mobile/src/lib/filters.ts` → `parseYear`: first `\d{4}` match) so client and
  server agree. If a range is present, define and document which end you use (recommend
  the **start** year).
- Store the parsed `build_year` as an integer column (part of the denormalization in
  [§6](#6-listing-level-filters--denormalization)) and index it.
- If no year can be parsed, the residence does **not** match when the filter is set.

---

## 9. Sorting & pagination

**Priority:** `newest`/`oldest` are **P1**; the other sorts and the `near` param are
**P2** (see [§0](#0-delivery-priorities-mvp-first)). A fixed default order
(`created_at DESC, id`) ships in **P0** for stable pagination, before the `sort` param is
exposed.

### Sort options

`sort` is a single **named enum** — the UI shows a fixed menu, so each value maps cleanly
to one defined `ORDER BY` (simpler and less error-prone than a `sort_by` + `order` pair).
Always append `id` as the final tie-breaker for stable paging, and order rows whose sort
key is null **last** (`NULLS LAST`) regardless of direction.

| `sort` value | `ORDER BY` | Source | Notes |
|---|---|---|---|
| `newest` *(default)* | `created_at DESC, id DESC` | residence | "When we first saw it" (locked decision). |
| `oldest` | `created_at ASC, id ASC` | residence | |
| `price_asc` | `current_price_eur ASC` | residence | Cheapest first. |
| `price_desc` | `current_price_eur DESC` | residence | Most expensive first. |
| `area_desc` | `surface_area_m2 DESC` | denormalized (§6) | Largest first. |
| `area_asc` | `surface_area_m2 ASC` | denormalized (§6) | Smallest first. |
| `price_per_m2_asc` | `(current_price_eur / surface_area_m2) ASC` | derived | "Best value" first — a standout sort for real estate. Needs non-null price **and** area; store a generated `price_per_m2` column so it's indexable. |
| `distance` | distance to `near`, ASC | geo | Nearest first. **Requires the `near` param** below. With PostGIS, KNN via `geography <-> point`. |

`price_asc`/`price_desc` are the obvious additions; `price_per_m2_asc` and `distance` are
the two that most differentiate a property app. **Trim any the UI won't expose** — each is
independent. Cheap future options the data already supports: **energy efficiency**
(`energy_label` rank, most-efficient first) and **recently reduced** (only once price
history is tracked — today's `status_changed_at` reflects status, not price).

### `near` — reference point for distance sort

| Param | In | Type | Notes |
|---|---|---|---|
| `near` | query | string `lon,lat` (WGS84, **longitude first**, same axis order as `bbox`) | The point distances are measured from — the searched location or current map center. Used only by `sort=distance`; ignored otherwise. If `sort=distance` is sent without `near`, return `422` (or fall back to `newest` — pick one and document it). |

### Pagination

- **Offset paging** is fine for this app. Inserting residences between page fetches shifts
  offsets slightly; acceptable here. If skips/dupes ever become a problem, a
  `(sort-key, id)` **cursor** is the drop-in upgrade (out of scope now).
- `has_more = offset + len(items) < total`.

---

## 10. Versioning, migration & compatibility

### Why this matters here

The web build always runs the latest code, but **native iOS/Android installs can't be
force-updated** — old app versions stay in users' hands for months. There's a single
backend, so the day we deploy a breaking change, every already-installed app hits it.
The backend must therefore **serve multiple client contracts at once**, and each app
build must **declare which contract it speaks**. That declaration is the `api_version`
flag — yes, a version flag in the API call achieves exactly what you asked.

### The mechanism: a client-declared contract version

- The app sends **`api_version=<int>`** on every request, set **once, centrally** (in
  the `request()` wrapper / `env.ts`) as a build-time constant — never per call.
- `api_version` is a single **global integer** for the whole API contract, bumped
  **only on breaking changes**. Additive changes (new optional params, new response
  fields) do **not** bump it.
- **Absent ⇒ legacy `1`.** This is the critical rule: every app already in the wild
  sends no flag and expects the bare array, so "absent" must mean the *oldest* contract.
  Never default absent to "latest" — that would break every installed app on deploy day.
- For the change in this spec: `1` (or absent) → **bare `ResidenceOut[]`**;
  `2` → **`ResidencePage` envelope**. The new app build ships with the constant set to
  `2`.

Query param vs. header — either works; pick one and apply it centrally:

| | `?api_version=2` (recommended) | `X-API-Version: 2` header |
|---|---|---|
| Client effort | trivial — URL already built in `client.ts` | trivial — `request()` already merges headers |
| Debuggability | visible in URLs/logs/curl | needs header logging |
| URL cleanliness | adds a param to every URL | clean URLs |
| Caching | distinct URLs cache separately | needs `Vary: X-API-Version` |

The query param matches your instinct ("a flag in the API call"), is easiest to eyeball
in logs, and fits the client's existing `URLSearchParams` builder — so it's the
recommendation. A header is equally valid if you prefer clean URLs.

### Versioning controls the response shape only (for now)

Request additions in this spec (`building_type`, `bbox`, `min_*`, `sort`, …) are
**backward compatible by construction**: an old app never sends them, and the server
applies "no constraint" defaults — identical to today's behavior. So only the
**response envelope** needs the version gate. Don't reject the new params for
`api_version=1`; read the request the same way regardless of version, and use the
version *only* when choosing the response representation. The **`ResidenceOut` item
schema is untouched**, so the existing `residenceToListing` client mapping keeps working
unchanged in both versions.

### Make the client resilient in *both* directions

A version flag covers "new backend serves old app." To also survive **"some users still
hit an older/stale backend"** (rollbacks, an un-updated environment — the case in your
message), the new client adapter should **accept either response shape**, so a new app
degrades gracefully against an old backend that ignores `api_version` and returns the
bare array:

```ts
// packages/data/src/client.ts — tolerate legacy array AND v2 envelope
const res = await request<ResidenceOut[] | ResidencePage>(`/v1/residences?${params}`);
const page = Array.isArray(res)
  ? { items: res, total: res.length, limit: res.length, offset: 0, has_more: false }
  : res;
```

With the **server** defaulting absent→legacy **and** the **client** normalizing either
shape, a mismatch in either direction degrades instead of crashing. (We'll implement
that client adapter on our side — it's noted here so the contract is shared.)

### Lifecycle: deprecation & sunset

- **Observability:** log `api_version` plus the app build (`X-App-Version: 1.4.0`, sent
  for telemetry only — **never branch behavior on the marketing version**, only on the
  explicit `api_version` integer). This tells you when a contract's traffic has dropped
  to ~0 and is safe to remove.
- **Support window:** decide and document a policy (e.g. "serve the current and one
  prior contract, for ≥ 12 months").
- **Forced-update path (optional, recommended):** expose the minimum supported contract
  — e.g. a `min_supported_api_version` field on a lightweight `/v1/meta` endpoint, and/or
  RFC 8594 `Deprecation`/`Sunset` response headers. When the backend finally drops an
  app's contract, the app can detect it and show a "please update" screen instead of
  failing opaquely.

### Affected client code (our side, FYI)

`packages/data/src/client.ts` (`getListings`, `getListing` — send `api_version`, parse
the envelope), `packages/data/src/queries.ts` (`useListings` — bbox/sort/pagination),
and `ListingQuery` in `packages/types/src/index.ts` (new fields).

### Alternative considered: URI path versioning (`/v2/residences`)

Shipping `/v2/residences` (envelope) alongside `/v1/residences` (array) is the classic
approach and is perfectly fine — more explicit and CDN-friendly, but it duplicates the
route surface and forces a coarser, whole-namespace bump for every breaking change.
Given the change here is a single isolated response-shape switch, the lighter
`api_version` flag on the existing `/v1` route is the better fit. **Pick one and be
consistent** — don't mix path and flag versioning for the same concern.

---

## 11. Validation & errors

- **Malformed input** (wrong type, `bbox` not 4 floats, unknown enum value) → `422`
  with a descriptive message (FastAPI/ninja does most of this for free once params are
  typed).
- **Logically empty ranges** (e.g. `min_price > max_price`, or inverted `bbox`) →
  prefer returning **`200` with an empty page** (`total: 0`) over `422`; it keeps the
  client simple. Pick one and document it.
- `limit` outside 0–100 → clamp or `422` (FastAPI default is `422`; either is fine).

---

## 12. Performance / indexing checklist

- Composite index supporting the default query: `(deal_type, created_at DESC, id DESC)`.
- B-tree indexes on the residence-level filter columns: `current_price_eur`,
  `building_type`, `energy_label` (equality/`IN` for the set filter; an ordinal int only for the optional P2 sort),
  `current_status`, and the denormalized `bedroom_count` / `bathroom_count` /
  `surface_area_m2` / `build_year`.
- Spatial index for `bbox` (PostGIS GiST on a `geography` point, or composite
  `(latitude, longitude)` B-tree) — see [§5](#5-geographic-queries-bbox).
- `total` is an exact `COUNT(*)` over the filtered set; the same indexes serve it.
  Exact counts are fine at this scale — revisit only if the table grows enormous.

---

## 13. Worked examples

The client sends `api_version=2` on **every** request (set centrally). It's shown in the
first two examples and omitted from the rest for brevity.

Filters screen committed (buy; €300k–€600k; apartment **or** terraced; 2+ bed; 1+ bath;
70–150 m²; energy A/B/C; built ≥ 1990; newest first; first page of 50):

```
GET /v1/residences
  ?api_version=2
  &deal_type=sale
  &min_price=300000&max_price=600000
  &building_type=apartment&building_type=terraced
  &min_bedrooms=2&min_bathrooms=1
  &min_area_m2=70&max_area_m2=150
  &energy_label=A&energy_label=B&energy_label=C
  &min_build_year=1990
  &sort=newest&limit=50&offset=0
```

Badge count only (same filters, no page of homes):

```
GET /v1/residences?api_version=2&deal_type=sale&min_price=300000&max_price=600000&...&limit=0
→ { "items": [], "total": 142, "limit": 0, "offset": 0, "has_more": true }
```

Map pan / viewport load (bbox + active filters, marker cap 200):

```
GET /v1/residences?bbox=4.26,52.06,4.32,52.10&deal_type=sale&sort=newest&limit=200&offset=0
```

Tap a neighborhood (client sends the tapped polygon's bounding box):

```
GET /v1/residences?bbox=4.281,52.072,4.305,52.089&deal_type=sale&sort=newest&limit=200
```

Next page of the list:

```
GET /v1/residences?...&sort=newest&limit=50&offset=50
```

Oldest first:

```
GET /v1/residences?...&sort=oldest
```

Cheapest first / most expensive first:

```
GET /v1/residences?...&sort=price_asc
GET /v1/residences?...&sort=price_desc
```

Nearest to the searched location first (distance sort needs a reference point):

```
GET /v1/residences?bbox=4.26,52.06,4.32,52.10&sort=distance&near=4.29,52.08
```

---

## 14. OpenAPI delta (drop-in)

New/changed parameters on `GET /v1/residences` (existing string/price/status/offset
params omitted for brevity):

```yaml
parameters:
  - { in: query, name: api_version, required: false,
      schema: { type: integer, enum: [1, 2], default: 1 },
      description: 'Response contract: 1=legacy array, 2=ResidencePage envelope' }
  - { in: query, name: deal_type, required: false,
      schema: { allOf: [{ $ref: '#/components/schemas/DealType' }], default: sale } }
  - { in: query, name: building_type, required: false,
      schema: { type: array, items: { $ref: '#/components/schemas/BuildingType' } },
      style: form, explode: true }            # building_type=apartment&building_type=terraced
  - { in: query, name: min_bedrooms,  required: false, schema: { type: integer, minimum: 0 } }
  - { in: query, name: min_bathrooms, required: false, schema: { type: integer, minimum: 0 } }
  - { in: query, name: min_area_m2,   required: false, schema: { type: integer, minimum: 0 } }
  - { in: query, name: max_area_m2,   required: false, schema: { type: integer, minimum: 0 } }
  - { in: query, name: energy_label, required: false,
      schema: { type: array, items: { $ref: '#/components/schemas/EnergyLabel' } },
      style: form, explode: true }            # energy_label=A&energy_label=B
  - { in: query, name: min_build_year, required: false,
      schema: { type: integer, minimum: 1800, maximum: 2100 } }
  - { in: query, name: bbox, required: false,
      schema: { type: string },
      description: 'WGS84 minLon,minLat,maxLon,maxLat' }
  - { in: query, name: sort, required: false,
      schema: { type: string,
                enum: [newest, oldest, price_asc, price_desc, area_asc, area_desc, price_per_m2_asc, distance],
                default: newest } }
  - { in: query, name: near, required: false,
      schema: { type: string },
      description: 'WGS84 lon,lat reference point; required when sort=distance' }
  - { in: query, name: limit,  required: false,
      schema: { type: integer, minimum: 0, maximum: 100, default: 20 } }  # min lowered 1→0
```

New schemas:

```yaml
DealType:
  type: string
  enum: [sale, rent]          # only `sale` populated today
ResidencePage:
  type: object
  required: [items, total, limit, offset, has_more]
  properties:
    items:    { type: array, items: { $ref: '#/components/schemas/ResidenceOut' } }
    total:    { type: integer }
    limit:    { type: integer }
    offset:   { type: integer }
    has_more: { type: boolean }
```

`GET /v1/residences` `200` response body is `ResidencePage` when `api_version=2`, and the
legacy `array<ResidenceOut>` when absent/`1`.
