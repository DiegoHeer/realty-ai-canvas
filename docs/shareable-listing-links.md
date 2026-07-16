# Shareable listing links (huismusapp.com Universal Links)

Sharing a listing from `listing/[id].tsx` used to produce a `huismus://listing/:id`
deep link — useless to anyone without the app already installed, and
untrackable by any web analytics. This doc covers what shipped to replace it
with a public `https://huismusapp.com/...` link that opens the app when
installed and falls back to a website otherwise, plus the outstanding
`huismusapp.com` hosting work that lives outside both of these repos.

## URL contract

```
https://huismusapp.com/<locale>/listing/<slug>/<id>
https://huismusapp.com/nl/listing/martin-luther-kinglaan-129/11292
```

| Segment | Source | Required for lookup? |
|---|---|---|
| `locale` | `i18n.language` (`en`/`nl`/`pt`) | No — cosmetic, app doesn't act on it |
| `slug` | Backend `Residence.slug`, e.g. `"martin-luther-kinglaan-129"` | No — cosmetic (SEO) |
| `id` | Residence id | **Yes** — the only segment the app looks up |

`slug` and `locale` only affect how the URL *reads*; both the app and (per the
checklist below) the website must resolve purely on `id`. When a residence has
no street the backend's `slug` is `null` and the mobile app falls back to
repeating the id (`.../listing/11292/11292`) rather than breaking the URL
shape — see `listingWebUrl` below.

## What shipped

### Backend (`realty-alerts`, uncommitted — pending your review)

- `Residence.slug` — a computed `@property` (`services/api/scraping/models.py`),
  not a DB column: `slugify(f"{street} {house_number}{house_letter}{house_number_suffix}")`
  via Django's built-in `slugify`. Returns `None` when `street` is null. No
  migration needed. Reads only plain columns already on the row, so — unlike
  `title`/`image_url` on the same model — it's safe to call per-row on the list
  endpoint without an N+1 query.
- Exposed as `slug: str | None` on both `ResidenceOut` (detail) and
  `ResidenceSummaryOut` (list) in `services/api/scraping/schemas.py`, the
  latter via a `resolve_slug` staticmethod (mirroring the existing
  `resolve_image_url` pattern).
- Tests: `tests/test_residence_model.py` (slug derivation, diacritics, no-street
  case), `tests/test_residence_detail.py`, `tests/test_residence_list.py`
  (including the `test_item_shape_is_slim` field-shape contract test).

### Mobile (`realty-ai-canvas`, branch `feat/shareable-listing-link`, pushed)

- **`packages/types`** — `Listing.slug?: string`.
- **`packages/data/src/residences.ts`** — maps the API's `slug` (`null` → `undefined`)
  in both `summaryToListing` and `residenceToListing`.
- **`apps/mobile/src/lib/listing-share-url.ts`** — `listingWebUrl(listing, language)`
  builds the URL above, guarding `language` against `isSupportedLanguage` and
  falling back to `listing.id` when `slug` is absent.
- **`apps/mobile/src/app/listing/[id].tsx`** — `onShare` now shares
  `listingWebUrl(...)` instead of an `expo-linking` `createURL` deep link.
  Outbound realtor links (the "Visit \<realtor\>" buttons) now also append
  `?utm_source=huismusapp.com&utm_medium=referral` via
  `apps/mobile/src/lib/analytics/utm.ts` (`withUtmParams`, merged with any
  existing query string) — a separate, earlier ask, bundled into the same
  branch since it touches the same screen.
- **`apps/mobile/app.json`** — `ios.associatedDomains: ["applinks:huismusapp.com"]`
  and an `android.intentFilters` entry (`autoVerify: true`, `https://huismusapp.com`,
  `VIEW` + `BROWSABLE`/`DEFAULT`) so the OS hands matching URLs to the app.
- **`apps/mobile/src/app/[locale]/listing/[slug]/[id].tsx`** (new route) —
  what Universal/App Links actually open. Ignores `locale`/`slug`, waits for
  onboarding state to hydrate, marks onboarding done (`completeOnboarding()`),
  and `router.replace`s to the real `/listing/[id]` screen. Rendered as a bare
  spinner since it's on-screen for a moment at most.
- **`apps/mobile/src/app/_layout.tsx`** — the onboarding gate now checks
  `useSegments()` and skips its own `/onboarding` redirect while the current
  route is the shared-listing redirect above (`segments.length === 4 &&
  segments[1] === 'listing'`). Without this, a fresh install opened via a
  shared link would race: both the gate and the redirect screen fire in the
  same commit, and whichever's `router.replace` ran last would win,
  occasionally bouncing the user into onboarding instead of the listing.

Verified via Playwright against the web export: navigating to
`/nl/listing/<anything>/<real-id>` renders the redirect screen, then lands on
the real listing detail screen with live staging data. The onboarding-skip
half of this can't be verified on web (the gate is native-only,
`Platform.OS !== 'web'`); it's a straightforward code-read guarantee, not yet
exercised on-device.

## What's NOT done — and can't be, from either repo

### 1. `huismusapp.com` hosting (owned by another repo/team)

For the OS to actually treat `https://huismusapp.com/...` as an app link
rather than a normal web link, that domain must serve, over plain HTTPS, with
no redirects and the exact content-types below:

| Path | Purpose | Must contain |
|---|---|---|
| `/.well-known/apple-app-site-association` | iOS Universal Links verification | `content-type: application/json` (no `.json` extension in the path), `applinks.details` entry for app ID `<TEAM_ID>.com.fastvibes.huismus`, `paths` including `/*/listing/*/*` |
| `/.well-known/assetlinks.json` | Android App Links verification | `relation: ["delegate_permission/common.handle_all_urls"]`, `target.package_name: "com.fastvibes.huismus"`, `target.sha256_cert_fingerprints`: the **release** signing cert's SHA-256 fingerprint(s) from the Play Console / EAS credentials |
| `/<locale>/listing/<slug>/<id>` | SEO landing page for users without the app | Should resolve purely on `<id>` (slug/locale are cosmetic, see [URL contract](#url-contract)); ideally a smart-banner / store-redirect for non-app visitors |

Both `.well-known` files are static and can be served with no build step. The
locale set to support is `en`, `nl`, `pt` (`packages/i18n/src/index.ts`), though
the landing page shouldn't hard-fail on an unrecognized locale either, since
the app itself doesn't validate it before generating a link.

### 2. A new native build

`associatedDomains` / `intentFilters` are compiled into the native binary —
not OTA-updatable. Nothing will actually open the app from a real
`huismusapp.com` link until a new build ships via EAS with this `app.json`.

### 3. Backend deploy

The `slug` field only exists in the local backend checkout described above.
Until it's deployed, `listingWebUrl` keeps working (falls back to repeating
the id) but every shared link looks like `.../listing/11292/11292` instead of
a readable slug.
