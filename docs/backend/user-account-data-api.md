# User Account Data API — Backend Spec

**Audience:** backend developer for the Realty Alerts API (`api-staging.realty-ai.nl`,
repo `realty-alerts`, service `services/api`).
**Scope:** move four kinds of per-user data from device-local storage into the user's
account, so they follow the user across devices and survive reinstalls:

1. **Favorites** — residences liked via the heart toggle,
2. **Recently viewed** — residences whose detail/preview the user opened,
3. **Search preferences** — the map/list filter configuration,
4. **Notification preferences** — channels + topics for the (future) alerts pipeline.

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
| **P0** | Favorites: model + `GET/PUT/DELETE /v1/me/favorites…` + login merge | Highest user value; exercises the whole pattern (auth, envelope, merge) once, cheaply |
| **P1** | Recently viewed: same pattern + retention task; Search preferences: `GET/PUT /v1/me/preferences/search` | Mechanical repeats of P0 |
| **P2** | Notification preferences: `GET/PUT /v1/me/preferences/notifications` | Pure storage — no delivery pipeline yet, but it unblocks the alerts work and the app's "coming soon" settings page |
| **P3** | Device registry for push (`POST/DELETE /v1/me/devices`) + the alert/digest pipeline itself | Out of scope here; sketched in [§7](#7-the-future-alerts-pipeline-context-not-scope) so P2's schema is right for it |

---

## 1. Current state

### Client (this repo)

All four data kinds are device-local AsyncStorage, wrapped in
`apps/mobile/src/lib/storage.ts` (`realty:` namespace):

| Data | Store | Key | Shape | Cap |
|---|---|---|---|---|
| Favorites | `apps/mobile/src/lib/likes.ts` | `realty:likes` | full `Listing` snapshots, MRU | 200 |
| Recently viewed | `apps/mobile/src/lib/recent-views.ts` | `realty:recent-views` | full `Listing` snapshots, MRU | 12 |
| Search preferences | `apps/mobile/src/lib/filters.ts` | `realty:filters` | one `Filters` object (see [§5](#5-search-preferences)) | 1 |
| Notification preferences | — none — | — | the settings page is a "coming soon" placeholder (`settings/notifications.tsx`) | — |

**Id mapping:** the client's `Listing.id` is `String(residence.id)` — the backend's
internal integer PK, straight from `ResidenceSummaryOut.id`
(`packages/data/src/residences.ts:174`). So clients send `residence_id: int` and no new
identifier is needed.

**Auth:** the app signs in via allauth headless (`/_allauth/app/v1/…`, JWT bearer tokens
kept in SecureStore — `packages/data/src/auth-client.ts`, `apps/mobile/src/lib/secure-tokens.ts`)
and attaches `Authorization: Bearer <JWT>` centrally in the request wrapper. Logged-out
users never hit these endpoints — local storage remains the offline/anonymous experience.

### Backend (`realty-alerts/services/api`)

- Django 6 + django-ninja 1.6; routers `v1_router` (public) and `internal_router`
  (API-key) in `scraping/api.py`.
- `Residence` model (`scraping/models.py:72`, `db_table="residences"`), int PK, stable
  `bag_id`. **Residences are hard-deleted** after 365 days in a terminal status
  (`scraping/cleanup.py`, Celery task `scraping.cleanup_expired_residences`) — every new FK
  must pick an explicit `on_delete` stance ([§3](#3-data-model)).
- List serialization: `ResidenceSummaryOut` + the `{items,total,limit,offset,has_more}`
  `ResidencePage` envelope (`scraping/schemas.py:113,139`). `image_url` comes from the
  `_COVER_IMAGE` queryset annotation (`scraping/api.py:200`) — **any endpoint returning
  summaries must `.annotate(cover_image_url=_COVER_IMAGE)`** or the resolver raises.
- Auth hook: `jwt_token_auth`; test fixtures `test_user` / `user_headers`
  (`tests/conftest.py:44-55`) make authenticated endpoint tests one-liners.

---

## 2. Design principles

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
  sets keyed on `(user, residence)` — union with per-item timestamps. Preferences are
  single documents — LWW via an `updated_at` the client echoes back.
- **Additive, no `api_version` gate.** Brand-new endpoints under `/v1`; nothing existing
  changes shape (same call as feedback-api). They appear in `/openapi.json` automatically.

---

## 3. Data model

New Django app **`accounts`** (recommended): this is the first genuinely user-owned
domain, with its own retention rules — keeping it out of `scraping` keeps that app about
the catalog. (Dropping the same models into `scraping` also works if one-app simplicity
is preferred; nothing below depends on the choice.)

```python
class FavoriteResidence(models.Model):
    """A residence the user saved via the heart toggle."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="favorites")
    residence = models.ForeignKey("scraping.Residence", on_delete=models.CASCADE,
                                  related_name="favorited_by")
    liked_at = models.DateTimeField()          # client-supplied on merge, else now()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_favorites"
        constraints = [models.UniqueConstraint(fields=["user", "residence"],
                                               name="uniq_user_favorite")]
        indexes = [models.Index(fields=["user", "-liked_at"])]


class ResidenceView(models.Model):
    """A recently-viewed residence; re-viewing refreshes viewed_at (MRU)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="residence_views")
    residence = models.ForeignKey("scraping.Residence", on_delete=models.CASCADE,
                                  related_name="viewed_by")
    viewed_at = models.DateTimeField()

    class Meta:
        db_table = "user_residence_views"
        constraints = [models.UniqueConstraint(fields=["user", "residence"],
                                               name="uniq_user_residence_view")]
        indexes = [models.Index(fields=["user", "-viewed_at"])]


class UserPreferences(models.Model):
    """One row per user; created lazily on first write (get_or_create)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="preferences")

    # Search preferences: an opaque, client-owned document (see §5).
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

### Deletion stances (deliberate)

- **`residence` FK → CASCADE, both models.** When the cleanup task hard-deletes a
  terminal residence, its favorite/view rows vanish with it. The client keeps its local
  snapshot, so nothing breaks visually; the row simply stops coming back from the server.
  *Rejected alternative:* tombstoning by `bag_id` snapshot to show "listing removed" — it
  complicates the sold/expired UX for little value in v1; revisit if product wants it.
- **`user` FK → CASCADE.** Account deletion removes everything — mirrors the
  unverified-account cleanup precedent (`scraping/cleanup.py`) and is the GDPR-erasure
  path ([§10](#10-retention-privacy--deletion)).

### Server-side caps (abuse bounds, not product limits)

| Collection | Cap | On overflow |
|---|---|---|
| Favorites | 500 per user (client caps at 200) | reject the write: `422 favorites_limit_reached` |
| Recent views | 50 per user (client shows 12) | silently evict oldest `viewed_at` rows |
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
`Content-Type: application/json`. Schemas follow the `FooIn`/`FooOut` naming convention.

### Favorites

```
GET    /v1/me/favorites?limit=&offset=     → 200 FavoritePage
PUT    /v1/me/favorites/{residence_id}     → 204   (idempotent add; body optional)
DELETE /v1/me/favorites/{residence_id}     → 204   (idempotent remove)
POST   /v1/me/favorites/merge              → 200 FavoriteMergeOut   (login merge, §6)
```

- **GET** returns the `{items,total,limit,offset,has_more}` envelope (same limits as
  `/v1/residences`: `limit` default 20, max 100), ordered `-liked_at`. Items are the
  existing summary shape plus the timestamp:

  ```python
  class FavoriteItemOut(ResidenceSummaryOut):
      liked_at: datetime
  ```

  Build the queryset off `Residence` (`filter(favorited_by__user=request.user)`) and
  **reuse the `_COVER_IMAGE` annotation** — see §1's warning.
- **PUT** upserts `(user, residence_id)`. Optional body `{"liked_at": <ISO8601>}` for
  offline-queued writes (clamped to `now()` if in the future); defaults to `now()`.
  `404` if the residence id doesn't exist (deleted/never existed) — the client treats
  that as "drop it locally too". Re-PUT of an existing favorite refreshes `liked_at`.
- **DELETE** returns 204 whether or not the row existed (idempotent — offline queues
  replay safely).

### Recently viewed

```
GET    /v1/me/recent-views?limit=&offset=  → 200 RecentViewPage    (items: viewed_at)
POST   /v1/me/recent-views                 → 204   body {"residence_id": int}
DELETE /v1/me/recent-views                 → 204   (clear all — the app's existing
                                                    "clear recently viewed" action)
POST   /v1/me/recent-views/merge           → 200   (login merge, §6)
```

- **POST** upserts with `viewed_at = now()` and evicts beyond the 50-row cap. Called on
  the same triggers that call `recordRecentView` today (detail open, map-marker preview).
  Unknown `residence_id` → **204 anyway** (view events are fire-and-forget telemetry-ish
  writes; don't make the client handle 404s for a residence that expired an hour ago).
- **GET** ordered `-viewed_at`, same envelope + `viewed_at` per item, same annotation.

---

## 5. Search preferences

The client's `Filters` object (`apps/mobile/src/lib/filters.ts`) is a **client-owned
vocabulary** — the server stores it, echoes it back, and never branches on it (the actual
filtering still happens per-request via `/v1/residences` query params). Store it opaquely
so the app can evolve filters without a backend release:

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
> now — they're a UX convenience keyed to PDOK geocoding, not account data. Add a
> `recent_searches` JSON document later only if product asks for cross-device parity.

---

## 6. Login merge protocol

The moment a user signs in (fresh signup **or** returning login on a device with
anonymous data), the client merges up, then adopts server state:

1. `POST /v1/me/favorites/merge` with everything in `realty:likes`:

   ```json
   { "items": [ { "residence_id": 4211, "liked_at": "2026-07-10T14:03:00Z" }, … ] }
   ```

   Server semantics: **union**. Insert missing rows; for existing rows keep the newer
   `liked_at`; clamp future timestamps to `now()`; **silently skip** ids that no longer
   resolve to a residence, reporting them back. Cap check applies post-union. Response:

   ```json
   { "total": 37, "skipped_residence_ids": [999], "items": [ …full FavoriteItemOut list… ] }
   ```

   (≤ 500 items by construction, so one response — no pagination.)
2. Same for `POST /v1/me/recent-views/merge` (union on `viewed_at`, evict beyond 50).
3. `GET /v1/me/preferences/search` — if the server has a document and the local one is
   older (or default), adopt the server's; else `PUT` the local one. The LWW contract in
   §5 makes the order safe either way.
4. Client replaces its local stores with the merged server state (ids + fresh
   `ResidenceSummaryOut` snapshots — a free data refresh).

Merge endpoints are **idempotent** — a crash mid-merge is fixed by re-running the whole
sequence. One merge round-trip per store, not one request per item (a 200-favorite merge
must not be 200 PUTs on mobile).

---

## 7. The future alerts pipeline (context, not scope)

Storage-only in P2, but the schema is shaped for the pipeline the repo is named after:

- **Topics** map to concrete jobs: `notify_new_matches` (new residences matching the
  user's saved `search` document), `notify_price_drops` / `notify_status_changes`
  (changes on **favorited** residences — favorites double as the watch-list).
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
| `PUT /v1/me/favorites/{id}` unknown residence | `404 {"detail": "residence not found"}` |
| Favorites cap exceeded (single PUT or merge) | `422 {"detail": "favorites_limit_reached", "limit": 500}` |
| `search` document > 4 KB or not a JSON object | `422 {"detail": "payload_too_large" / field detail}` |
| Merge `items` > 500 entries | `422` (client caps are far below this) |
| Unknown residence in merge / recent-view POST | **not an error** — skip & report (§6) / 204 (§4) |

---

## 9. Performance & indexing checklist

- [ ] `(user, -liked_at)` / `(user, -viewed_at)` composite indexes (§3) — the only query
      shapes are "this user's rows, newest first".
- [ ] Favorites/views GET: single query via `Residence.objects.filter(favorited_by__user=…)`
      with `_COVER_IMAGE` annotation — no N+1 (the annotation exists precisely for this;
      `scraping/api.py:200`).
- [ ] `PUT`/`POST` upserts via `update_or_create` on the unique constraint (or
      `bulk_create(update_conflicts=True)` for merge) — one statement per write.
- [ ] Recent-view eviction: one `DELETE … WHERE id IN (SELECT … OFFSET 50)` per write, or
      piggyback on the retention task if per-write cost matters.
- [ ] Rate limiting: django-ninja has **no throttling configured today** — add ninja's
      `throttle` on the write endpoints (e.g. 60/min/user; recent-view POSTs are the hot
      path). Allauth's limiter doesn't cover these.

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
- Favorites/views also disappear when their residence hits the 365-day terminal TTL
  (CASCADE, §3) — document this for support ("my favorite vanished" = the listing was
  sold over a year ago).
- No data leaves the account scope: every query is `request.user`-filtered; there is no
  admin-facing aggregate here in v1 (add opt-in analytics later if wanted, honoring
  `realty:analytics-opt-out`).

---

## 11. Testing checklist (backend)

pytest + factory-boy per repo conventions (`tests/conftest.py`, `tests/factories.py`);
the `test_user` / `user_headers` fixtures already provide authenticated requests.

- [ ] 401 for every endpoint without a bearer token.
- [ ] Favorite PUT/DELETE idempotency (double-PUT refreshes `liked_at`; double-DELETE 204).
- [ ] GET envelope + `-liked_at` ordering + `image_url` present (annotation regression).
- [ ] Merge: union, newer-timestamp-wins, future clamp, unknown-id skip+report, cap.
- [ ] Recent views: upsert refresh, 50-row eviction, clear-all, unknown-id 204.
- [ ] Preferences LWW: stale PUT returns the newer doc unchanged; fresh PUT applies.
- [ ] CASCADE: deleting a residence (cleanup path) and deleting a user removes rows.
- [ ] Retention task deletes only >90-day views; add a `FavoriteResidenceFactory` etc.
- [ ] User-isolation: user A can never read/mutate user B's rows (fixture with two users).

---

## 12. Client wiring (our side, FYI)

Not backend scope; recorded so the contract is checked against real call-sites:

- `packages/data`: new `account-data.ts` client module (favorites/views/preferences
  calls) using the existing JWT-attaching request wrapper.
- `apps/mobile/src/lib/likes.ts` / `recent-views.ts`: keep the `createPersistedListStore`
  API surface (`toggleLike`, `recordRecentView`, hooks — the map's Favorites/Recent pills
  and all screens keep working untouched); add a write-through sync layer + the §6 login
  merge triggered from the auth state change.
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

# Like residence 4211 (heart toggle, while online)
curl -X PUT -H "Authorization: Bearer $JWT" \
  https://api-staging.realty-ai.nl/v1/me/favorites/4211

# First page of favorites, newest first
curl -H "Authorization: Bearer $JWT" \
  "https://api-staging.realty-ai.nl/v1/me/favorites?limit=20&offset=0"
# → {"items":[{"id":4211,…,"image_url":"…","liked_at":"2026-07-11T09:12:00Z"}],
#    "total":1,"limit":20,"offset":0,"has_more":false}

# Login merge of anonymous likes
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"items":[{"residence_id":4211,"liked_at":"2026-07-10T14:03:00Z"},
                {"residence_id":999,"liked_at":"2026-07-09T08:00:00Z"}]}' \
  https://api-staging.realty-ai.nl/v1/me/favorites/merge
# → {"total":1,"skipped_residence_ids":[999],"items":[…]}

# Save search preferences (LWW)
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
