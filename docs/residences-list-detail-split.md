# Splitting `/v1/residences` into a map-list endpoint and a detail endpoint

## Context

Today both the map screen (`apps/mobile/src/app/(tabs)/index.tsx`) and the listing
detail screen (`apps/mobile/src/app/listing/[id].tsx`) are fed from the single
`GET /v1/residences` list endpoint in the backend (`realty-alerts`,
`services/api/scraping/api.py`).

Two problems:

1. **The list payload is heavy.** Every list item embeds the full nested
   `listings` array (one entry per realtor portal) and the
   `foundation_risk_description` text field — none of which the map needs.
2. **There is no detail endpoint at all.** The frontend's `getListing(id)`
   (`packages/data/src/client.ts:310`) fetches `/v1/residences?limit=100`
   *unfiltered* and does a client-side `find()`. Any residence outside the
   first 100 rows is unreachable from the detail screen (and from deep links /
   shared links). This split fixes a real correctness bug, not just payload size.

**Decisions made (with owner):**

- **In-place breaking change**: `/v1/residences` list items become the slim
  shape directly (commit marked `!` + `BREAKING CHANGE:` per realty-alerts
  convention). No `api_version` gate, no parallel endpoint — the mobile app is
  the only consumer and is pre-release.
- **Slim list includes cover image + status** in addition to location, address,
  price, surface area, bedrooms, bathrooms, energy label — the map preview card
  and explore list render a photo and a status badge today.

---

## Target API contract

### `GET /v1/residences` — slim list (map)

Keeps **all** existing query params unchanged: filters (`city`, `min_price`/`max_price`,
`building_type`, `energy_label`, `min_bedrooms`, `min_bathrooms`,
`min_area_m2`/`max_area_m2`, `min_build_year`, `deal_type`, `status`, …),
`bbox`, `sort`, `limit`/`offset` pagination, and the `api_version` envelope
logic (`>=2` → `{items, total, limit, offset, has_more}`, `1` → bare array).
Only the **item shape** changes:

```json
{
  "id": 123,
  "city": "Amsterdam",
  "street": "Prinsengracht",
  "house_number": 412,
  "house_letter": null,
  "house_number_suffix": null,
  "postcode": "1016 HH",
  "latitude": 52.3676,
  "longitude": 4.8841,
  "current_price_eur": 750000,
  "current_status": "available",
  "surface_area_m2": 120,
  "bedroom_count": 3,
  "bathroom_count": 2,
  "energy_label": "A",
  "image_url": "https://..."
}
```

Notes:
- `surface_area_m2` / `bedroom_count` / `bathroom_count` come from the
  **denormalized, indexed columns on `Residence`** (kept fresh by
  `scraping/reconciliation.py`) — no join needed. They are *not* on the wire
  today (only nested per-listing), so this is a new top-level exposure.
- `image_url` is a **best-effort** cover photo: the freshest of the
  residence's listings that has a non-null `image_url`; `null` when no source
  has any image. Note this deliberately differs from the
  `Residence.image_url` `@property` (`scraping/models.py:150`), which reads the
  freshest *resolved* listing and so can return null while another portal
  listing does have a photo — and which issues one query per row (N+1) if
  serialized. Use a `Subquery` annotation instead (see backend step 2). The
  frontend already renders a neutral placeholder when there is no image, so
  `null` needs no special handling.
- Dropped from the list response: `listings[]`, all `foundation_risk_*`,
  soil/zoning fields, `bag_id`, `neighbourhood`, `district`, timestamps.

### `GET /v1/residences/{id}` — full detail (new)

Returns everything: the current `ResidenceOut` shape (all address, foundation
risk, soil, zoning fields, timestamps, nested `listings[]` with per-portal
`url`/`website`/`image_url`/`surface_area_m2`/`bedroom_count`/`bathroom_count`/
`room_count`/`construction_period`), **plus** the denormalized
`surface_area_m2` / `bedroom_count` / `bathroom_count` / `build_year` columns
at top level, so list and detail always display the same numbers (today the
frontend derives beds/baths/area from a heuristically "chosen" source listing,
which can disagree with the denormalized value the backend sorts/filters on).

`404` (Ninja's default JSON 404 via `Http404`) for unknown ids.

---

## Backend changes (`~/Projects/realty-alerts`, `services/api/`)

### 1. Schemas — `scraping/schemas.py`

- Add `ResidenceSummaryOut` with exactly the fields above.
- Retype the envelope: `ResidencePage.items: list[ResidenceSummaryOut]`
  (in-place change, no new envelope class).
- Extend `ResidenceOut` (now detail-only) with the denormalized
  `surface_area_m2`, `bedroom_count`, `bathroom_count`, `build_year`.

### 2. Endpoints — `scraping/api.py`

- **`list_residences` (`api.py:212`)**: change response type to
  `list[ResidenceSummaryOut] | ResidencePage`. Replace
  `prefetch_related("listings")` with a `Subquery` annotation for the
  best-effort cover image — the residence's listings filtered to
  `image_url__isnull=False` (exclude empty strings too), ordered by the same
  freshness ranking as `Residence._freshest_resolved_listing`, taking the
  first `image_url`; the annotation naturally yields `NULL` when no listing
  has an image. The prefetch existed only to serialize the nested `listings`
  array, which is gone. This keeps the list at
  2 queries (3 with the `api_version>=2` count) and stops hauling full listing
  rows for up to 100 residences.
- **New detail handler**, registered next to `list_residences` on `v1_router`:

  ```python
  @v1_router.get("/residences/{residence_id}", response=ResidenceOut, tags=["catalog"])
  def get_residence(request, residence_id: int):
      return get_object_or_404(
          Residence.objects.prefetch_related("listings"), id=residence_id
      )
  ```

- **Filter consistency check**: `min_bedrooms` / `min_bathrooms` /
  `min_area_m2` / `max_area_m2` are applied in `_apply_listing_filters`
  (`api.py:154`). If those currently filter through the `listings` relation,
  switch them to the denormalized `Residence` columns (`bedroom_count`,
  `bathroom_count`, `surface_area_m2` — all indexed) so filtering matches the
  values now displayed from those same columns. Verify the current lookups
  during implementation; same check for `energy_label`.

### 3. Backend tests — `services/api/tests/`

- Update the `test_residence_*` suite (`test_residence_list.py`,
  `test_residence_page.py`, `test_residence_filters.py`,
  `test_residence_listing_filters.py`, sort tests) for the slim item shape.
  Keep/adjust the query-count assertions (`test_residence_list.py:210`,
  `test_residence_page.py:55`) — they are the N+1 guardrail and must still pass
  with the annotation approach.
- New `test_residence_detail.py`: 200 with full shape incl. nested `listings`
  and top-level denormalized fields; 404 for unknown id; query-count assertion.
- Factories: `ResidenceFactory` (`tests/factories.py:19`) doesn't set
  beds/baths/area/lat/lon by default — set per-test as the existing tests do.

### 4. Commit / deploy

- Single PR: detail endpoint + slim list together. Conventional commit with
  `!` and a `BREAKING CHANGE:` footer (realty-alerts `CLAUDE.md` convention).
- Merge to main → GitOps auto-deploys to staging
  (`api-staging.realty-ai.nl`). The frontend PR (below) should land right
  after; in the window between the two, current app builds show cards without
  beds/baths/area/photo and a broken detail screen — accepted (pre-release).

### Out of scope (backend repo)

- The stale in-repo mobile client (`realty-alerts/apps/mobile/`) already calls
  a non-existent `/api/v1/residences/{id}` with a pre-migration type — it is
  broken today and unaffected by this change. Leave it; realignment is a
  separate cleanup.

---

## Frontend changes (`realty-ai-canvas`)

### 1. Types — `packages/types/src/index.ts`

Split `Listing` into a slim base + full detail:

```ts
export interface ListingSummary {
  id: string;
  title: string;            // derived from address, as today
  price: number;
  currency: string;
  status: ListingStatus;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  energyLabel?: string;
  address: ListingAddress;
  location: GeoPoint;
  images: ListingImage[];   // 0 or 1 (cover) — keeps ListingCard untouched
}

export interface Listing extends ListingSummary {
  description?: string;
  roomCount?: number;
  constructionPeriod?: string;
  buildingType?: BuildingType;
  foundationRisk?: FoundationRisk;
  createdAt: string;
  sourceUrl?: string;
  sources?: ListingSource[];
}
```

Keeping `images: ListingImage[]` on the summary (rather than a new
`coverImageUrl` field) means `ListingCard` (both `packages/ui/src/listing-card.tsx`
and `apps/mobile/src/components/listing-card.tsx`) and `ListingMap` need only a
**type** change (`Listing` → `ListingSummary`), no logic change.

### 2. Wire types + mappers — `packages/data/src/residences.ts`

- Add wire type `ResidenceSummaryOut` matching the new list item.
- Add `residenceSummaryToListing(r): ListingSummary` — reuse `addressLine()`
  for `title`/`address.line1`; `images` = `r.image_url` ? one entry : `[]`;
  beds/baths/area/energy label from the new top-level fields;
  status via the existing `STATUS_TO_LISTING` map.
- Keep `residenceToListing` for detail, but prefer the new top-level
  denormalized `surface_area_m2`/`bedroom_count`/`bathroom_count` and fall back
  to the "chosen source listing" heuristic only when they're null
  (`roomCount`/`constructionPeriod` still come from the chosen listing — they
  aren't denormalized).
- Retarget `hasCoordinates` to the summary wire type (structural — both have
  `latitude`/`longitude`).

### 3. Client — `packages/data/src/client.ts`

- `getListings(query)` → returns `ListingSummary[]`; same URL, params
  (`buildResidenceParams`), envelope handling, geocode filter, and client-side
  `matchesSearch`; map items with `residenceSummaryToListing`.
- `getListing(id)` → **rewrite**: `request<ResidenceOut>(\`/v1/residences/${id}\`)`
  mapped with `residenceToListing`. Delete the fetch-100-and-`find()` hack.
  A 404 throws (existing `request()` behavior), which React Query surfaces as
  `isError` → the detail screen's existing `listing.loadError` state.
- `getListingsCount` unchanged.

### 4. Hooks — `packages/data/src/queries.ts`

No structural change: `useListings` → `ListingSummary[]`, `useListing` →
`Listing`, keys unchanged (`listingKeys.detail(id)` now backed by a real
network call instead of a second full-list fetch — strictly less traffic).

### 5. Consumers (type-level changes only)

- `apps/mobile/src/lib/likes.ts` and `recent-views.ts`: retype the persisted
  stores to `ListingSummary`. The detail screen still passes its full `Listing`
  to `toggleLike`/`recordRecentView` — structurally valid (extra fields are
  harmless in the snapshot). Snapshots recorded from the map now lack
  detail-only fields; that's fine because snapshots are only ever rendered
  through `ListingCard` (slim fields) and marker recoloring uses only `id`.
- `(tabs)/index.tsx`, `(tabs)/explore.tsx`, `components/listing-map.tsx`
  (+ `.web.tsx`), `components/map-shared.ts`: `Listing` → `ListingSummary` in
  props/state types. No behavior change.
- `listing/[id].tsx`: unchanged.

### 6. Frontend tests

- `packages/data/src/__tests__/client.test.ts`: convert the inline
  `mockResidences` fixture to the slim shape; **add `getListing` tests** (URL
  `/v1/residences/{id}`, mapping, 404 → rejects) — there are none today.
- `packages/data/src/__tests__/residences.test.ts`: add
  `residenceSummaryToListing` cases; extend detail-mapper cases for the
  top-level-preferred beds/baths/area.
- `packages/ui` / `apps/mobile` ListingCard tests: fixtures are full listings,
  which satisfy `ListingSummary` — expect compile-only churn.
- **e2e** `e2e/fixtures.ts`: `stubApi` currently answers three shapes off
  query params on `**/v1/residences**`. Rework: slim items in the paginated
  envelope + count mode, and a new route for `**/v1/residences/<id>` returning
  the full fixture. The bare-array branch existed solely for the old
  `getListing` hack — delete it. `listing-detail.spec.ts` (deep-links to
  `/listing/1`) now exercises the real detail path.
- Visual baselines: regenerate locally with `bun run test:update-snapshots` if
  the data-driven specs (explore/map/listing-detail) drift.

---

## Rollout order

1. Backend PR in `realty-alerts` (breaking): slim list + new detail endpoint +
   test updates. Merge → auto-deploy to staging.
2. Frontend PR in `realty-ai-canvas`: types split, client rewrite, consumer
   retypes, test/stub updates. Verify against staging, then merge.

## Verification

- **Backend**: full `pytest` run in `services/api/`; manually hit
  `/v1/residences?limit=2&api_version=2` and `/v1/residences/{id}` on staging
  (or the PR preview URL `api-pr-<n>.realty-ai.nl`) and confirm shapes +
  query-count tests pass.
- **Frontend**: `bun run test` + `bun run typecheck`; `bun run test:e2e` with
  the updated stubs; then drive the real flow with the `verifier-web` skill
  against staging — map loads pins with prices, tapping a pin shows the
  preview card (photo, beds/baths/area, status), opening it loads the detail
  screen (sources, foundation risk, description block), and confirm via the
  network panel that the map fires only the slim list call and the detail
  screen fires exactly one `/v1/residences/{id}` call.
- **Deep-link check**: open `/listing/<id>` directly for a residence that is
  *not* in the first 100 unfiltered rows — previously broken, must now load.
