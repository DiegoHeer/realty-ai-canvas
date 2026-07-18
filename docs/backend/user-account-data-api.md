# User Account Data API — Backend Spec

**Audience:** backend developer for the Realty Alerts API (`api-staging.realty-ai.nl`,
repo `realty-alerts`, service `services/api`).
**Scope:** move four kinds of per-user data from device-local storage into the user's
account, so they follow the user across devices and survive reinstalls:

1. **Favorites** — residences liked via the heart toggle,
2. **Recently viewed** — residences whose detail/preview the user opened,
3. **Search preferences** — the map/list filter configuration,
4. **Notification preferences** — channels + topics for the (future) alerts pipeline.

**Core design rule: the account stores the same shapes the app already persists
locally.** The server is a per-user *replica* of the device's AsyncStorage keys — same
documents, same list semantics, same caps ([§2](#2-design-principles)). A user who
collected likes and tuned filters anonymously and *then* creates an account syncs by
pushing those stores up as-is; no format translation on either side.

Everything is **additive** under `/v1` and gated on the existing JWT auth. Companion to
[`residences-search-api.md`](./residences-search-api.md) (follows its
[§10 versioning](./residences-search-api.md#10-versioning-migration--compatibility) and
[§11 validation/errors](./residences-search-api.md#11-validation--errors) conventions) and
[`../oauth-social-login.md`](../oauth-social-login.md) (how clients obtain the JWT).

> **Status:** nothing exists server-side today — the backend has **no per-user data models
> at all** (only stock `auth.User` + allauth's `EmailAddress`/`SocialAccount`). All four
> data kinds live client-side in AsyncStorage (see [§1](#1-current-state)). The auth
> infrastructure to gate the new endpoints is already built and tested:
> `allauth.headless.contrib.ninja.security.jwt_token_auth` (see `tests/test_auth.py`, whose
> docstring says it exercises *"the JWT infrastructure … that future gated endpoints will
> rely on"* — these are those endpoints).

---

## 0. Delivery priorities

| Phase | Deliverable | Why this order |
|---|---|---|
| **P0** | Favorites: model + `GET/PUT/DELETE /v1/me/favorites…` + login merge | Highest user value; exercises the whole pattern (auth, snapshots, merge) once, cheaply |
| **P1** | Recently viewed: same pattern + retention task; Search preferences: `GET/PUT /v1/me/preferences/search` | Mechanical repeats of P0 |
| **P2** | Notification preferences: `GET/PUT /v1/me/preferences/notifications` | Pure storage — no delivery pipeline yet, but it unblocks the alerts work and the app's "coming soon" settings page |
| **P3** | Device registry for push (`POST/DELETE /v1/me/devices`) + the alert/digest pipeline itself | Out of scope here; sketched in [§7](#7-the-future-alerts-pipeline-context-not-scope) so P2's schema is right for it |

---

## 1. Current state

### Client (this repo) — the shapes being mirrored

All four data kinds are device-local AsyncStorage, wrapped in
`apps/mobile/src/lib/storage.ts` (`realty:` namespace). The two lists share one
abstraction, `createPersistedListStore({ key, limit, idOf })`
(`apps/mobile/src/lib/persisted-list-store.ts`): an MRU list — **add moves to front,
dedupes by id, evicts beyond `limit`**:

| Data | Store | Key | Shape | Cap |
|---|---|---|---|---|
| Favorites | `apps/mobile/src/lib/likes.ts` | `realty:likes` | array of full **`Listing` snapshots**, newest-liked first | 200 |
| Recently viewed | `apps/mobile/src/lib/recent-views.ts` | `realty:recent-views` | array of full **`Listing` snapshots**, newest-viewed first | 12 |
| Search preferences | `apps/mobile/src/lib/filters.ts` | `realty:filters` | one **`Filters`** object (see [§5](#5-search-preferences)) | 1 |
| Notification preferences | — none — | — | the settings page is a "coming soon" placeholder (`settings/notifications.tsx`) | — |

A `Listing` snapshot (`@realty/types`) is the app's render-ready projection — roughly:
`{ id, title, price, currency, status, bedrooms, bathrooms, areaSqm, address{…},
location{latitude,longitude}, images[{id,url}], createdAt, … }`. The stores keep whole
snapshots *deliberately*, so favorites/recents render instantly from disk without
refetching; a snapshot is refreshed every time the user reopens that listing.

**Id mapping:** the client's `Listing.id` is `String(residence.id)` — the backend's
internal integer PK, straight from `ResidenceSummaryOut.id`
(`packages/data/src/residences.ts:174`). The server can therefore link a snapshot to its
catalog row by parsing the id — but the snapshot itself is the payload of record ([§3](#3-data-model)).

**Auth:** the app signs in via allauth headless (`/_allauth/app/v1/…`, JWT bearer tokens
kept in SecureStore — `packages/data/src/auth-client.ts`, `apps/mobile/src/lib/secure-tokens.ts`)
and attaches `Authorization: Bearer <JWT>` centrally in the request wrapper. Logged-out
users never hit these endpoints — local storage remains the offline/anonymous experience.

### Backend (`realty-alerts/services/api`)

- Django 6 + django-ninja 1.6; routers `v1_router` (public) and `internal_router`
  (API-key) in `scraping/api.py`.
- `Residence` model (`scraping/models.py:72`, `db_table="residences"`), int PK, stable
  `bag_id`. **Residences are hard-deleted** after 365 days in a terminal status
  (`scraping/cleanup.py`, Celery task `scraping.cleanup_expired_residences`) — relevant to
  the FK stance in [§3](#3-data-model).
- Auth hook: `jwt_token_auth`; test fixtures `test_user` / `user_headers`
  (`tests/conftest.py:44-55`) make authenticated endpoint tests one-liners.
- Because these endpoints echo stored snapshots rather than re-serializing catalog rows,
  they do **not** need `ResidenceSummaryOut` or the `_COVER_IMAGE` annotation dance that
  `/v1/residences` uses — there is no serialization work in P0/P1 beyond thin
  `FooIn`/`FooOut` wrappers.

---

## 2. Design principles

- **Store what the client stores.** Wire format = storage format = the app's local
  format. Favorites and recent views are stored and returned as the client's `Listing`
  snapshots (opaque, client-owned vocabulary — same stance as the `search` document);
  preferences are the client's `Filters` object. The server never rebuilds these from the
  catalog, so client and server can never disagree about shape, and the sync layer is a
  replica push/pull, not a mapping.
- **Same list semantics as `createPersistedListStore`.** The server implements the exact
  MRU contract the app already has: upsert-to-front, dedupe by listing id, evict beyond
  the cap — with the *same caps* (favorites 200, recent views 12). Overflow evicts the
  oldest; it is never an error, exactly like local.
- **Local-first, write-through.** The device stores stay; they are the cache and the
  logged-out experience. When a session exists, every local mutation is mirrored to the
  API (fire-and-forget with retry; a failed sync must never block or crash the UI — same
  "best-effort" stance as `storage.ts`).
- **The account is the source of truth while logged in.** On login the client merges its
  anonymous data up ([§6](#6-login-merge-protocol)), then adopts the server state. On
  logout the local copy simply stops syncing (kept on device — matches today's UX).
- **Identity only from the JWT.** `request.user`, never a body/query field — same
  reasoning as [`feedback-api.md`](./feedback-api.md#user-identity-from-the-jwt).
- **Sets merge by union; documents merge by last-write-wins.** Favorites/recent views are
  sets keyed on the listing id — union with per-item timestamps. Preferences are single
  documents — LWW via an `updated_at` the client echoes back.
- **Additive, no `api_version` gate.** Brand-new endpoints under `/v1`; nothing existing
  changes shape (same call as feedback-api). They appear in `/openapi.json` automatically.

**Accepted trade-off:** snapshots duplicate catalog data and can go stale. That is the
*same* trade-off the app already made locally (and for the same reason: instant renders,
no refetch), and it self-heals: the client refreshes a snapshot — locally *and*, via
write-through, on the server — every time the user reopens that listing, and fresh data
is always one `GET /v1/residences/{id}` away. The nullable `residence` FK ([§3](#3-data-model))
keeps a queryable link into the catalog for the alerts pipeline without making the
snapshot depend on it.

---

## 3. Data model

New Django app **`accounts`** (recommended): this is the first genuinely user-owned
domain, with its own retention rules — keeping it out of `scraping` keeps that app about
the catalog. (Dropping the same models into `scraping` also works if one-app simplicity
is preferred; nothing below depends on the choice.)

```python
class FavoriteResidence(models.Model):
    """A residence the user saved via the heart toggle.

    `snapshot` is the client's Listing object, stored verbatim — the payload of
    record, echoed back as-is. `residence` is a best-effort link into the catalog
    (resolved from the snapshot's id at write time), used only by server-side
    consumers (future alerts); the favorite does not depend on it.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="favorites")
    residence = models.ForeignKey("scraping.Residence", null=True, blank=True,
                                  on_delete=models.SET_NULL, related_name="favorited_by")
    listing_id = models.CharField(max_length=32)   # snapshot's `id` — the dedupe key
    snapshot = models.JSONField()                   # the client's Listing, verbatim
    liked_at = models.DateTimeField()               # client-supplied on merge, else now()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_favorites"
        constraints = [models.UniqueConstraint(fields=["user", "listing_id"],
                                               name="uniq_user_favorite")]
        indexes = [models.Index(fields=["user", "-liked_at"])]


class ResidenceView(models.Model):
    """A recently-viewed residence; re-viewing refreshes viewed_at + snapshot (MRU)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="residence_views")
    residence = models.ForeignKey("scraping.Residence", null=True, blank=True,
                                  on_delete=models.SET_NULL, related_name="viewed_by")
    listing_id = models.CharField(max_length=32)
    snapshot = models.JSONField()
    viewed_at = models.DateTimeField()

    class Meta:
        db_table = "user_residence_views"
        constraints = [models.UniqueConstraint(fields=["user", "listing_id"],
                                               name="uniq_user_residence_view")]
        indexes = [models.Index(fields=["user", "-viewed_at"])]


class UserPreferences(models.Model):
    """One row per user; created lazily on first write (get_or_create)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="preferences")

    # Search preferences: the client's Filters object, verbatim (see §5).
    search = models.JSONField(default=dict, blank=True)
    search_updated_at = models.DateTimeField(null=True, blank=True)

    # Notification preferences: explicit columns — the server branches on these (§7).
    notify_email = models.BooleanField(default=True)
    notify_push = models.BooleanField(default=False)   # off until a device registers (P3)
    notify_new_matches = models.BooleanField(default=True)
    notify_price_drops = models.BooleanField(default=True)
    notify_status_changes = models.BooleanField(default=True)
    digest = models.CharField(max_length=8, choices=Digest.choices, default=Digest.DAILY)
    locale = models.CharField(max_length=2, choices=Locale.choices, default=Locale.EN)
    notifications_updated_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_preferences"
```

Enums as `models.TextChoices` (repo convention): `Digest = instant|daily|weekly`,
`Locale = en|nl|pt` (mirror `packages/i18n`).

### `residence` link resolution (best-effort, invisible to the client)

On every write, if the snapshot's `id` parses as an int matching an existing
`Residence.pk`, set the FK; otherwise leave it `NULL`. Never reject a write because the
catalog row is missing — locally a like never fails because the backend expired a
listing, and the replica behaves the same.

### Deletion stances (deliberate — mirror local behavior)

- **`residence` FK → SET_NULL, both models.** When the cleanup task hard-deletes a
  terminal residence, the favorite/view row **survives with its snapshot** — exactly what
  happens on-device today (a liked home never vanishes because the catalog moved on). The
  row just drops out of the alerts watch-list join. *Rejected alternative:* CASCADE —
  it would make server favorites silently diverge from the local list they replicate.
- **`user` FK → CASCADE.** Account deletion removes everything — mirrors the
  unverified-account cleanup precedent (`scraping/cleanup.py`) and is the GDPR-erasure
  path ([§10](#10-retention-privacy--deletion)).

### Caps — identical to local, enforced the same way

| Collection | Cap (= local cap) | On overflow |
|---|---|---|
| Favorites | **200** per user | evict least-recently-liked (the documented local behavior in `likes.ts`) |
| Recent views | **12** per user | evict oldest `viewed_at` (local behavior) |
| Any `snapshot` | 8 KB serialized | `422 payload_too_large` (abuse bound; real snapshots are <1 KB) |
| `search` document | 4 KB serialized | `422 payload_too_large` |

Migrations per repo convention: one logical change per migration; `makemigrations
accounts && migrate` (new tables only — nothing to backfill).

---

## 4. Endpoints — favorites & recently viewed

All account endpoints live on one router, mounted like the existing ones:

```python
me_router = Router(auth=jwt_token_auth, tags=["account"])
api.add_router("/v1/me", me_router)
```

A request with no/invalid/expired JWT gets allauth's standard **401**. All bodies are
`Content-Type: application/json`. Schemas follow the `FooIn`/`FooOut` naming convention;
the `listing` field inside them is typed `dict` (opaque client document, validated only
as: JSON object, has a string `id`, ≤ 8 KB).

### Favorites

```
GET    /v1/me/favorites                → 200 {"items": [FavoriteItemOut], "total": int}
PUT    /v1/me/favorites/{listing_id}   → 204   body: {"listing": {…}, "liked_at"?: ISO8601}
DELETE /v1/me/favorites/{listing_id}   → 204   (idempotent remove)
POST   /v1/me/favorites/merge          → 200 {"items": […], "total": int}   (login merge, §6)
```

```python
class FavoriteItemOut(Schema):
    listing: dict        # the stored snapshot, verbatim
    liked_at: datetime
```

- **GET returns the whole store, newest-liked first — no pagination.** The collection is
  capped at 200 by construction, and the client consumes it as a replica
  (`items.map(i => i.listing)` *is* the new local `realty:likes` array), so the
  `{items,total,limit,offset,has_more}` envelope from `/v1/residences` is deliberately
  not used here — pagination on a bounded replica only complicates the sync loop.
- **PUT** upserts by `(user, listing_id)`: refreshes `snapshot` and `liked_at`
  (body value clamped to `now()` if in the future; defaults to `now()`), resolves the
  `residence` FK best-effort, evicts beyond the 200 cap. Path id must equal
  `listing.id` (422 otherwise). **No 404s** — a snapshot for an expired residence is
  stored fine, like local.
- **DELETE** returns 204 whether or not the row existed (idempotent — offline queues
  replay safely).

### Recently viewed

```
GET    /v1/me/recent-views             → 200 {"items": [RecentViewItemOut], "total": int}
POST   /v1/me/recent-views             → 204   body: {"listing": {…}}
DELETE /v1/me/recent-views             → 204   (clear all — the app's existing
                                                "clear recently viewed" action)
POST   /v1/me/recent-views/merge       → 200   (login merge, §6)
```

- **POST** upserts with `viewed_at = now()`, refreshes the snapshot, evicts beyond the
  12-row cap — the server-side twin of `recordRecentView` (called on the same triggers:
  detail open, map-marker preview).
- **GET** whole store, newest-viewed first, `viewed_at` per item — same rationale as
  favorites.

---

## 5. Search preferences

The client's `Filters` object (`apps/mobile/src/lib/filters.ts`) is stored **verbatim** —
the server keeps it, echoes it back, and never branches on it (the actual filtering still
happens per-request via `/v1/residences` query params). Opaque storage means the app can
evolve the filter vocabulary without a backend release:

```
GET /v1/me/preferences/search   → 200 {"search": {...}|null, "updated_at": <ISO8601>|null}
PUT /v1/me/preferences/search   → 200 (same shape, post-merge)
```

- **PUT** body: `{"search": <object ≤ 4 KB>, "updated_at": <ISO8601>}` — the client's
  local modification time. **LWW:** apply only if `updated_at` is newer than the stored
  `search_updated_at`; either way return the winning document, so a stale device
  converges on the newer state in one round-trip.
- Validation is deliberately shallow: a JSON object, ≤ 4 KB, no schema on the keys. For
  reference (v1 vocabulary, do not enforce): `mode`, `minPrice`, `maxPrice`,
  `propertyTypes[]`, `minBedrooms`, `minBathrooms`, `minAreaSqm`, `maxAreaSqm`,
  `energyLabels[]`, `minBuildYear`, `sort` — plus a client-written `"version": 1`.

> Recent *searches* (`realty:recent-searches`, geocoder results) stay device-local for
> now — they're a UX convenience keyed to PDOK geocoding, not account data. When product
> wants cross-device parity, they slot straight into this pattern (they're another
> `createPersistedListStore`, cap 8).

---

## 6. Login merge protocol

The moment a user signs in (fresh signup **or** returning login on a device with
anonymous data), the client merges up, then adopts server state. Because the wire format
is the local format, "merge up" literally means posting the stored arrays:

1. `POST /v1/me/favorites/merge` with the whole `realty:likes` array (each entry the
   local `Listing` object, plus its timestamp — see the client note in [§12](#12-client-wiring-our-side-fyi)):

   ```json
   { "items": [ { "listing": { "id": "4211", "title": "…", … },
                  "liked_at": "2026-07-10T14:03:00Z" }, … ] }
   ```

   Server semantics: **union by `listing.id`**. Insert missing rows; for existing rows
   keep the newer `liked_at` *and its snapshot*; clamp future timestamps to `now()`;
   resolve each `residence` FK best-effort. Evict beyond the 200 cap after the union
   (oldest first). Every item is accepted — there are no unknown-id rejections, because
   the snapshot is the record. Response: the merged whole store (same shape as GET).
2. Same for `POST /v1/me/recent-views/merge` (union on `viewed_at`, evict beyond 12).
3. `GET /v1/me/preferences/search` — if the server has a document and the local one is
   older (or default), adopt the server's; else `PUT` the local one. The LWW contract in
   §5 makes the order safe either way.
4. Client replaces each local store with the merge response
   (`items.map(i => i.listing)`) — the arrays drop into `realty:likes` /
   `realty:recent-views` unchanged.

Merge endpoints are **idempotent** — a crash mid-merge is fixed by re-running the whole
sequence. One merge round-trip per store, not one request per item (a 200-favorite merge
must not be 200 PUTs on mobile). Bound the request: `items` ≤ the collection cap
(200 / 12) → `422` above that.

---

## 7. The future alerts pipeline (context, not scope)

Storage-only in P2, but the schema is shaped for the pipeline the repo is named after:

- **Topics** map to concrete jobs: `notify_new_matches` (new residences matching the
  user's saved `search` document), `notify_price_drops` / `notify_status_changes`
  (changes on **favorited** residences — favorites double as the watch-list, joined via
  the `residence` FK; rows whose FK is `NULL` — expired listings — simply don't match).
- **Channels:** `notify_email` works with the existing SMTP setup (allauth transactional
  mail today); `notify_push` needs the P3 **device registry** first
  (`Device`: `user` FK, unique `expo_push_token`, `platform`, `last_seen_at`;
  `POST/DELETE /v1/me/devices`). Keep `notify_push` default-`False` until then.
- **Delivery** = Celery tasks in the established pattern (`@shared_task(name="…")`,
  `scraping/tasks.py` style), scheduled via the **DB-driven beat scheduler** — an operator
  creates the periodic task in admin, same as `cleanup_expired_residences`. `digest`
  (`instant|daily|weekly`) and `locale` (email language) live in `UserPreferences` so the
  pipeline needs no schema change when it lands.

```
GET /v1/me/preferences/notifications  → 200 NotificationPreferencesOut
PUT /v1/me/preferences/notifications  → 200 (full-document put, LWW like §5)
```

`NotificationPreferencesOut` = the §3 columns:
`{email, push, new_matches, price_drops, status_changes, digest, locale, updated_at}`.
Full-document PUT (no PATCH) — the settings screen always knows the whole document.

---

## 8. Validation & errors

Follows [`residences-search-api.md` §11](./residences-search-api.md#11-validation--errors):
ninja's automatic **422** with field detail for malformed bodies/params, plus:

| Case | Response |
|---|---|
| Missing/invalid/expired JWT | `401` (allauth standard) |
| `listing` not a JSON object / missing string `id` | `422` field detail |
| Path `listing_id` ≠ body `listing.id` | `422 {"detail": "listing id mismatch"}` |
| `listing` snapshot > 8 KB, `search` doc > 4 KB | `422 {"detail": "payload_too_large"}` |
| Merge `items` longer than the collection cap (200 / 12) | `422` |
| Cap overflow on PUT/POST/merge | **not an error** — MRU eviction, like local (§3) |
| Snapshot for an expired/unknown residence | **not an error** — stored with `residence = NULL` (§3) |

---

## 9. Performance & indexing checklist

- [ ] `(user, -liked_at)` / `(user, -viewed_at)` composite indexes (§3) — the only query
      shapes are "this user's whole store, newest first" (≤ 200 rows).
- [ ] GET endpoints are single-table reads returning stored JSON — no catalog joins, no
      annotations, no N+1 by construction.
- [ ] `PUT`/`POST` upserts via `update_or_create` on the unique constraint (or
      `bulk_create(update_conflicts=True)` for merge) — one statement per write, plus one
      `Residence.objects.filter(pk=…)` lookup for the FK resolution.
- [ ] Eviction: one `DELETE … WHERE id IN (SELECT … OFFSET <cap>)` per write (12/200-row
      subqueries — negligible).
- [ ] Rate limiting: django-ninja has **no throttling configured today** — add ninja's
      `throttle` on the write endpoints (e.g. 60/min/user; recent-view POSTs are the hot
      path). Allauth's limiter doesn't cover these.
- [ ] Row size is bounded (8 KB × 212 rows worst case per user ≈ 1.7 MB) — no table-bloat
      concerns at any realistic user count.

---

## 10. Retention, privacy & deletion

- **Account deletion** erases everything via the `user` CASCADEs — no new work beyond
  wiring it into whatever account-deletion flow allauth exposes. This is the GDPR-erasure
  path.
- **Recently viewed is behavioral data — expire it.** Add
  `accounts.cleanup_stale_residence_views` (Celery, admin-scheduled) deleting rows with
  `viewed_at` older than **90 days**, mirroring `scraping/cleanup.py` +
  `tasks.py:cleanup_expired_residences`. Favorites and preferences are user-curated —
  keep them until the user removes them.
- **Favorites survive catalog cleanup** (SET_NULL, §3) — like the local list they mirror.
  If product later wants to badge these as "no longer listed", the `residence IS NULL`
  rows are exactly that set; no schema change needed.
- No data leaves the account scope: every query is `request.user`-filtered; there is no
  admin-facing aggregate here in v1 (add opt-in analytics later if wanted, honoring
  `realty:analytics-opt-out`).

---

## 11. Testing checklist (backend)

pytest + factory-boy per repo conventions (`tests/conftest.py`, `tests/factories.py`);
the `test_user` / `user_headers` fixtures already provide authenticated requests.

- [ ] 401 for every endpoint without a bearer token.
- [ ] Favorite PUT/DELETE idempotency (double-PUT refreshes `liked_at` + snapshot;
      double-DELETE 204). Path/body id mismatch → 422.
- [ ] GET echoes stored snapshots byte-for-byte, `-liked_at` ordering.
- [ ] MRU semantics: 201st favorite / 13th view evicts the oldest, never errors.
- [ ] Merge: union by listing id, newer-timestamp-wins keeps *that* snapshot, future
      clamp, post-union eviction, `items` over cap → 422.
- [ ] FK resolution: snapshot with a matching residence links it; unknown/expired id
      stores with `residence = NULL`; deleting a residence SET_NULLs (row + snapshot
      survive).
- [ ] Preferences LWW: stale PUT returns the newer doc unchanged; fresh PUT applies.
- [ ] Retention task deletes only >90-day views; user delete cascades all four tables.
- [ ] User-isolation: user A can never read/mutate user B's rows (fixture with two users).

---

## 12. Client wiring (our side, FYI)

Not backend scope; recorded so the contract is checked against real call-sites. Because
the server mirrors the local format, the sync layer is thin:

- `packages/data`: new `account-data.ts` client module (favorites/views/preferences
  calls) using the existing JWT-attaching request wrapper.
- `apps/mobile/src/lib/likes.ts` / `recent-views.ts`: keep the `createPersistedListStore`
  API surface (`toggleLike`, `recordRecentView`, hooks — the map's Favorites/Recent pills
  and all screens keep working untouched); add write-through (`PUT`/`POST`/`DELETE` on
  each mutation) and, on auth state change, the §6 merge — whose response drops straight
  into the store (`items.map(i => i.listing)`), since it *is* the local array shape.
- One addition to track: the local stores don't persist per-item timestamps today (list
  order encodes recency). For merge fidelity either derive `liked_at`/`viewed_at` from
  list position at merge time (good enough), or start persisting a timestamp alongside
  each entry (tiny, backward-compatible store change).
- `apps/mobile/src/lib/filters.ts`: `setFilters` additionally PUTs
  `/v1/me/preferences/search` (debounced), hydrate-on-login per §6 step 3.
- `settings/notifications.tsx`: replace the "coming soon" placeholder with the §7
  document editor (i18n keys under `notificationsPage.*`).
- Offline queue: a tiny persisted retry queue for failed writes (best-effort; drop after
  N attempts — the next login merge self-heals any loss).

---

## 13. Worked examples

```bash
JWT="…"

# Like residence 4211 (heart toggle, while online) — body is the local snapshot
curl -X PUT -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"listing":{"id":"4211","title":"Canal-side apartment","price":535000,
       "currency":"EUR","status":"for_sale","bedrooms":2,"bathrooms":1,"areaSqm":84,
       "address":{"line1":"Herengracht 1","city":"Amsterdam","postalCode":"1015 BA","country":"NL"},
       "location":{"latitude":52.379,"longitude":4.889},
       "images":[{"id":"4211-0","url":"https://…/cover.jpg"}],
       "createdAt":"2026-06-01T00:00:00.000Z"}}' \
  https://api-staging.realty-ai.nl/v1/me/favorites/4211

# Whole favorites store, newest first (drops straight into realty:likes)
curl -H "Authorization: Bearer $JWT" https://api-staging.realty-ai.nl/v1/me/favorites
# → {"items":[{"listing":{"id":"4211",…},"liked_at":"2026-07-11T09:12:00Z"}],"total":1}

# Login merge of anonymous likes — post the local array as-is
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"items":[{"listing":{"id":"4211",…},"liked_at":"2026-07-10T14:03:00Z"},
                {"listing":{"id":"3999",…},"liked_at":"2026-07-09T08:00:00Z"}]}' \
  https://api-staging.realty-ai.nl/v1/me/favorites/merge
# → {"items":[…merged, newest first…],"total":2}   (3999 stored with residence=NULL
#    if that listing already expired — it still renders from its snapshot)

# Save search preferences (LWW) — the local Filters object, verbatim
curl -X PUT -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"search":{"version":1,"mode":"buy","minPrice":300000,"maxPrice":600000,
       "propertyTypes":["apartment"],"minBedrooms":2,"minBathrooms":0,
       "minAreaSqm":null,"maxAreaSqm":null,"energyLabels":["A","B"],
       "minBuildYear":null,"sort":"newest"},
       "updated_at":"2026-07-11T09:15:00Z"}' \
  https://api-staging.realty-ai.nl/v1/me/preferences/search

# Notification preferences
curl -X PUT -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"email":true,"push":false,"new_matches":true,"price_drops":true,
       "status_changes":false,"digest":"daily","locale":"nl",
       "updated_at":"2026-07-11T09:16:00Z"}' \
  https://api-staging.realty-ai.nl/v1/me/preferences/notifications
```
