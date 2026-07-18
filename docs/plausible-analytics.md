# Plausible analytics integration

Anonymous, cookieless product analytics via the self-hosted **Plausible
Community Edition** at `plausible.realty-ai.nl`. This doc maps the app's surfaces
onto Plausible's data models, states the privacy rule every event obeys, and
records what Phase 1 wired up versus what Phase 2 adds.

## Instance capabilities (verified against `plausible.realty-ai.nl`)

It runs **Community Edition**, confirmed live via the Stats API. CE support:

| Model | CE? | Notes |
|-------|-----|-------|
| **Pages** (pageviews) | ✅ | Auto-tracked by `useScreenView` (route patterns) |
| **Goals** (custom events) | ✅ | `event:goal` breakdown returns 200 |
| **Custom properties** | ✅ | `event:props:*` breakdown returns 200 (a gated feature would 4xx) |
| **Funnels** | ❌ | Excluded from CE — reserved for Plausible Cloud Business |

Because CE has **no funnel visualization**, funnels are approximated (see
[Funnels](#funnels-no-native-ce-view)). The instrumentation itself is designed so
that approximation works.

## Privacy rule (non-negotiable)

The privacy screen promises *"no user data collected, only anonymous in-app
usage measured, and searches and preferences are never collected or resold."*
To keep that literally true, an event property value may only be:

- a **feature/UI identifier the _app_ owns** — auth method, outbound host,
  search-result _type_, overlay/pill id, setting name; or
- an **aggregate count** — `active_filter_count`, `cities_selected`.

It may **never** be a value the _user_ supplied: no price, area, build year, city
or place name, address, listing id, chosen property type, or energy label. This
rule is enforced by an allowlist test in `analytics-events.test.ts`. Because of
it, **no privacy-copy change is required.**

## Model mapping

| App surface | Plausible model | How |
|-------------|-----------------|-----|
| Screens / routes | Pages | Existing `useScreenView` pageviews (route patterns) |
| Onboarding steps (1 route, 5-page pager) | Pages + drop-off | Virtual pageviews `/onboarding/<step>` |
| Key actions (outbound, signup, favorite, search, filters) | Goals | `track()` custom events |
| Which overlay/pill/filter/setting/search-type/auth-method | Properties | Feature ids & counts only |
| Onboarding→signup, discovery→outbound | "Funnels" | Ordered pageviews + goal/property filtering |

## Code architecture

- **`src/lib/analytics/events.ts`** — the single source of truth. Event names
  live in `AnalyticsEvent` (must match the dashboard goal names). Pure
  `…Event()` builders return an `EventSpec` (name + `TrackOptions`); thin
  `track…()` wrappers pass it to `track()`. `hostOf()` extracts an outbound host
  without `new URL()` (RN's URL is partial). Split mirrors client.ts's
  pure-core/thin-wrapper style so payloads are unit-tested without a network.
- **Gating is centralised** in `track()` (`shouldTrack`: enabled + hydrated +
  not opted-out). Call sites never gate.
- **No new deps, no storage, no i18n** — event/property names are internal, not
  user-visible.
- Exposed through the `@/lib/analytics` barrel; `lib/likes.ts` imports
  `./analytics/events` directly to avoid pulling the hook exports into the store.

## Goals

### Phase 1 (implemented)

| Goal (dashboard name) | Fires when · site | Properties | Serves |
|-----------------------|-------------------|------------|--------|
| `Outbound Link` | Tap a listing source · `listing/[id].tsx` | `host`, `source_name`, `position` | **North-star** / lead-out |
| `Signup` | Register success (email `verifyPending`/`ok`, or Google) · `auth/register.tsx` | `method`; `email_verified` (email only — `false` while code pending, `true` if active) | Signup funnel |
| `Login` | Login success (email or Google) · `auth/login.tsx` | `method` | — |
| `Email Verified` | Verification code accepted · `auth/verify.tsx` | — | Signup funnel (pending → verified) |
| `Onboarding Completed` | `flow.tsx` `finish()` **and** `skip()` | `skipped`, `cities_selected`, `last_step` (furthest step reached) | Activation |
| `Search` | Resolve a search · `location-search.tsx` | `result_type`, `method` (typed/suggestion/recent) | Discovery |
| `Filters Applied` | "Show homes" · `settings/filters.tsx` | `active_filter_count` | Discovery |
| `Listing Favorited` | Heart on (choke point) · `lib/likes.ts` `toggleLike` | — | Engagement |
| `Overlay Enabled` | Enable a map layer · `index.tsx` `toggleOverlay` | `overlay` (noise/airQuality/energyLabels/buildingAge/wozValue/zoning/treeHeight) | Layer usage (e.g. `overlay=wozValue`) |

Plus **virtual pageviews** `/onboarding/{welcome,features,filters,cities,account}`
fired on step settle in `flow.tsx`.

> OAuth caveat: `signInWithGoogle` serves both new and returning users, so we
> attribute by **screen intent** — `Signup{method:google}` from the register
> screen, `Login{method:google}` from the login screen — rather than truly
> detecting first-time Google users.

### Phase 2 (planned)

| Goal | Fires when | Properties |
|------|-----------|------------|
| `Quick Filter Toggled` | `index.tsx` `toggleFilter` | `pill` (favorites/recent/popular/new/sold), `enabled` |
| `Filters Applied` (extend) | as Phase 1 | + `facets` = comma list of active facet _names_ (no values) |
| `Setting Changed` | appearance / language / map screens | `setting`; `value` only for appearance, language, buildings_3d |
| `Neighborhood Opened` | `index.tsx` `handleSelectPolygon` | `has_election_data` |
| `Listing Shared` | `listing/[id].tsx` `onShare` | — |
| `Listing Unfavorited` | `lib/likes.ts` `toggleLike` (off) | — |
| `Replay Intro` | profile replay action | — |
| `Password Reset Requested` | `auth/forgot-password.tsx` | — |

## Funnels (no native CE view)

CE cannot render funnels, so read them as:

1. **Onboarding drop-off** — Top Pages: `/onboarding/welcome` → `…/features` →
   `…/filters` → `…/cities` → `…/account`, capped by `Onboarding Completed`.
2. **Signup** — filter to `/auth/register` pageviews, read the `Signup`
   conversion rate.
3. **Discovery → Outbound** (north-star) — filter to `/listing/:id` visitors,
   read the `Outbound Link` conversion rate.
4. **Scripted** — the v2 query API (`POST /api/v2/query`, works with a Stats API
   key) can compute exact step counts with goal/property filters.

## Dashboard checklist (no code)

1. Create a custom-event **Goal** per name in the Phase 1 table.
2. Under **Properties**, enable: `host`, `source_name`, `method`, `email_verified`,
   `result_type`, `active_filter_count`, `cities_selected`, `skipped`, `last_step`,
   `overlay`.
3. To read funnels, use the goal/property filters described above.

## Enabling

Native ingestion needs no key. Analytics is **on by default** — `.env.example`
ships `EXPO_PUBLIC_PLAUSIBLE_ENABLED=true` (+ `_URL`, `_DOMAIN`), inlined into a
build from its env; it still respects the privacy-screen opt-out, and should be
set `false` for local dev/e2e. Keep the **read** key
(`PLAUSIBLE_API_KEY`, used only for stats/dashboard queries) **un-prefixed** so
it is never bundled into the shipped app. Ensure the E2E web-export build leaves
`EXPO_PUBLIC_PLAUSIBLE_ENABLED=false` so Playwright runs don't emit events.
