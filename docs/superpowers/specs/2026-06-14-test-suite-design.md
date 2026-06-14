# Test Suite Design — Realty AI Canvas

**Date:** 2026-06-14
**Status:** Approved
**Scope:** Comprehensive test coverage — unit, component/integration, and visual regression tests across the entire monorepo.

## Decisions

- **Test runner:** `bun:test` (built-in, Jest-compatible API) — single runner across all packages and the mobile app.
- **Component testing:** `@testing-library/react-native` (RNTL) — tests what users see and interact with.
- **Visual regression:** `@playwright/test` with `toHaveScreenshot()` against the Expo static web export.
- **Principle:** Tests define expected behavior. If source code diverges from what's correct, fix the source code — don't weaken the tests.

## Dependencies to Add

| Package | Where | Purpose |
|---------|-------|---------|
| `@testing-library/react-native` | `apps/mobile` devDeps | Component rendering + user interaction queries |
| `react-test-renderer` | `apps/mobile` devDeps | Required peer dep for RNTL |
| `@playwright/test` | root devDeps | Visual regression runner |
| `serve` | root devDeps | Serve static web export for Playwright |

## Scripts

Root `package.json`:
```json
"test": "bun --filter '*' test",
"test:e2e": "playwright test",
"test:update-snapshots": "playwright test --update-snapshots"
```

Per-package `package.json` (each workspace):
```json
"test": "bun test"
```

## Test File Convention

Tests live in `src/__tests__/` colocated within each package/app, mirroring the source structure:

```
packages/data/src/__tests__/format.test.ts
packages/data/src/__tests__/residences.test.ts
packages/data/src/__tests__/client.test.ts
packages/data/src/__tests__/queries.test.tsx
packages/i18n/src/__tests__/i18n.test.ts
packages/ui/src/__tests__/listing-card.test.tsx
apps/mobile/src/__tests__/area-polygons.test.ts
apps/mobile/src/__tests__/screens/explore.test.tsx
apps/mobile/src/__tests__/screens/listing-detail.test.tsx
apps/mobile/src/__tests__/screens/profile.test.tsx
apps/mobile/src/__tests__/screens/map.test.tsx
e2e/tests/explore.spec.ts
e2e/tests/listing-detail.spec.ts
e2e/tests/profile.spec.ts
e2e/tests/map.spec.ts
```

## Mocking Strategy

A shared `apps/mobile/test-setup.ts` preloaded by bun:test handles:

| Module | Mock approach |
|--------|--------------|
| `expo-router` | Mock `router.push`, `useLocalSearchParams`, `Stack`, `Stack.Screen` |
| `expo-image` | Passthrough `<Image>` that renders as a plain `<View>` or `<Image>` |
| `react-native-reanimated` | No-op mock (animations are synchronous identity transforms) |
| `react-native-safe-area-context` | Mock `SafeAreaView` as plain `View`, mock `useSafeAreaInsets` returning zeroes |
| `@maplibre/maplibre-react-native` | Mock as empty `<View>` — no native map in test |
| `expo-web-browser` | Mock `openBrowserAsync` as a jest.fn / spy |

For `packages/data` tests, `fetch` is mocked globally to control API responses. The `USE_MOCKS` flag is toggled per test to cover both mock and API code paths.

For `packages/i18n` and `packages/ui` tests, i18next is initialized with real locale files (not mocked) so translations are verified end-to-end.

## Unit Tests

### `packages/data/src/__tests__/format.test.ts`

| Test case | Expected behavior |
|-----------|-------------------|
| `formatPrice(675000, 'EUR', 'en')` | `"€675,000"` |
| `formatPrice(675000, 'EUR', 'nl')` | Dutch-formatted string with period grouping (exact format depends on Bun's Intl — verify at implementation time) |
| `formatPrice(0, 'EUR')` | Handles zero gracefully |
| `formatPrice(1450, 'EUR')` | Small rental price, no decimals |
| No locale passed | Falls back to environment default |

### `packages/data/src/__tests__/residences.test.ts`

| Test case | Expected behavior |
|-----------|-------------------|
| `residenceToListing()` — full residence | Maps all fields: id to string, status to ListingStatus, price, address line, images from sources, sourceUrl |
| `residenceToListing()` — null street | Falls back to city as `line1` |
| `residenceToListing()` — house_letter + suffix | Concatenates: `"Burgemeester Rothestraat 18N"` |
| `residenceToListing()` — no listing images | `images` is empty array |
| `residenceToListing()` — null price | Defaults to `0` |
| `hasCoordinates()` — both present | Returns `true`, narrows type |
| `hasCoordinates()` — null latitude | Returns `false` |
| `hasCoordinates()` — null longitude | Returns `false` |
| `LISTING_TO_RESIDENCE_STATUS` mapping | `for_sale->new`, `pending->sale_pending`, `sold->sold` |
| Status mapping (forward) | `new->for_sale`, `sale_pending->pending`, `sold->sold` |

### `packages/data/src/__tests__/client.test.ts`

| Test case | Expected behavior |
|-----------|-------------------|
| `getListings()` — mock mode | Returns filtered `mockListings` |
| `getListings({ status: 'for_sale' })` — mock mode | Returns only for_sale listings |
| `getListings({ minPrice, maxPrice })` — mock mode | Price range filtering works |
| `getListings({ search: 'canal' })` — mock mode | Case-insensitive text match on title+address |
| `getListings()` — API mode | Calls fetch with correct URL/params/headers, maps through `residenceToListing` |
| `getListings()` — API mode, non-geocoded filtered | Residences without lat/lng are dropped |
| `getListings({ search })` — API mode | Client-side search applied after API fetch |
| `getListing('lst_001')` — mock mode | Returns the matching listing |
| `getListing('nonexistent')` — mock mode | Throws "not found" error |
| `getAreas()` — mock mode | Returns `mockAreas` |
| `getAreas()` — API mode | Returns empty array |
| `request()` — non-ok response | Throws with status code and statusText |

### `packages/i18n/src/__tests__/i18n.test.ts`

| Test case | Expected behavior |
|-----------|-------------------|
| `isSupportedLanguage('en')` | `true` |
| `isSupportedLanguage('nl')` | `true` |
| `isSupportedLanguage('de')` | `false` |
| `isSupportedLanguage(undefined)` | `false` |
| `initI18n('en')` | Initializes with English active |
| `initI18n('nl')` | Switches to Dutch |
| `initI18n()` | Defaults to English |
| Locale completeness | Every key in `en.json` exists in `nl.json` and vice versa |
| Plural keys | `count_one`/`count_other` present in both locales |

### `apps/mobile/src/__tests__/area-polygons.test.ts`

| Test case | Expected behavior |
|-----------|-------------------|
| `toFeatureCollection()` | Wraps polygons into valid GeoJSON FeatureCollection with id/name/color properties |
| `toFeatureCollection([])` | Returns empty features array |
| `areasCenter()` — single polygon | Returns midpoint of bounding box |
| `areasCenter()` — multiple polygons | Returns midpoint spanning all polygons |
| `areasCenter([])` | Returns `null` |
| `areasCenter()` — MultiPolygon | Handles flattened coordinate rings |

## Component & Integration Tests

### `packages/ui/src/__tests__/listing-card.test.tsx`

| Test case | Expected behavior |
|-----------|-------------------|
| Renders price, title, address | Core content visible for a standard listing |
| Renders cover image when present | Image with correct URI |
| Renders placeholder when no images | Fallback view instead of image |
| Renders status badge | Shows translated status (e.g. "For sale") |
| Renders bed/bath/area stats | `"2 bd"`, `"1 ba"`, `"84 m2"` |
| `onPress` fires | Pressing the card calls the handler |
| Localised to Dutch | Shows `"Te koop"`, `"slpk"`, etc. |

### `apps/mobile/src/__tests__/screens/explore.test.tsx`

| Test case | Expected behavior |
|-----------|-------------------|
| Shows loading state | Loading text visible while fetching |
| Renders listing cards | One card per listing after data loads |
| Shows correct count | `"6 homes"` header |
| Card press navigates | `router.push` called with correct listing ID |
| Pull-to-refresh triggers refetch | `onRefresh` calls refetch |

### `apps/mobile/src/__tests__/screens/listing-detail.test.tsx`

| Test case | Expected behavior |
|-----------|-------------------|
| Loading spinner | Spinner visible while `useListing` loads |
| Error state | Shows `loadError` text on fetch failure |
| Renders listing content | Price, title, address, bed/bath/area stats |
| Renders cover image | expo-image with correct URI |
| Placeholder without image | Fallback view when no images |
| Shows "Visit realtor" button | When `sourceUrl` present |
| Hides "Visit realtor" button | When `sourceUrl` absent |
| Visit realtor opens browser | `openBrowserAsync` called with URL |
| Shows description when present | Description text visible |
| Hides description when absent | No description rendered |

### `apps/mobile/src/__tests__/screens/profile.test.tsx`

| Test case | Expected behavior |
|-----------|-------------------|
| Renders title and subtitle | Translated profile text visible |
| Renders in Dutch | Shows `"Profiel"` and Dutch subtitle |

### `apps/mobile/src/__tests__/screens/map.test.tsx`

| Test case | Expected behavior |
|-----------|-------------------|
| Renders map component | Mocked ListingMap present |
| Shows loading indicator | While listings are loading |
| Passes listings and areas to map | Correct props forwarded |
| Map selection navigates | `onSelect` calls `router.push` with listing ID |

### `packages/data/src/__tests__/queries.test.tsx`

| Test case | Expected behavior |
|-----------|-------------------|
| `useListings()` returns data | Returns mock listings in QueryClientProvider |
| `useListings({ status })` filters | Returns subset |
| `useListing(id)` returns single | Returns matching listing |
| `useListing(undefined)` disabled | Query not executed |
| `useAreas()` returns areas | Returns mock area polygons |
| Query keys are stable | Same input produces same cache key |

## Visual Regression Tests (Playwright)

### Directory structure

```
e2e/
├── playwright.config.ts
├── tests/
│   ├── explore.spec.ts
│   ├── listing-detail.spec.ts
│   ├── profile.spec.ts
│   └── map.spec.ts
└── screenshots/                # Baseline PNGs committed to git
```

### Configuration

- **Web server:** Playwright's `webServer` config runs `serve dist/ -l 3000`
- **Build:** `EXPO_PUBLIC_USE_MOCKS=true bun run export:web` before running tests (mock mode forced for determinism)
- **Viewport:** `1280x720` desktop to start
- **Threshold:** `maxDiffPixelRatio: 0.01`
- **Update flow:** `bun run test:update-snapshots` regenerates baselines after intentional UI changes

### Test cases

| Test file | Scenario | Screenshot captures |
|-----------|----------|---------------------|
| `explore.spec.ts` | Listings page - light | Full page with listing cards and header count |
| `explore.spec.ts` | Listings page - dark | Same page, `prefers-color-scheme: dark` emulated |
| `listing-detail.spec.ts` | Detail page - with image | Full detail view for `lst_001` |
| `listing-detail.spec.ts` | Detail page - stats/CTA | Bed/bath/area stats + "Visit realtor" button |
| `profile.spec.ts` | Profile page | Title + subtitle |
| `map.spec.ts` | Map page - fallback | Map container (baseline whatever renders) |

### Determinism safeguards

- Mock data is static (6 hardcoded Amsterdam listings)
- External image URLs (Unsplash) may cause flakiness — intercept in Playwright and replace with local placeholders, or use `waitForLoadState('networkidle')`
- Fonts: web export uses system fonts that vary by OS. CI should use Playwright's Docker image for consistent rendering. Baselines must be generated in the same environment.

## CLAUDE.md Updates

Add a `## Testing` section to the project `CLAUDE.md` covering:

- Test runner (`bun:test`), component testing (RNTL), visual regression (Playwright)
- Commands: `bun test`, `bun run test:e2e`, `bun run test:update-snapshots`
- Test file convention: `src/__tests__/<name>.test.ts(x)` colocated in each package
- Mocking setup: `apps/mobile/test-setup.ts`
- Visual regression: mock mode forced, baselines committed, update flow
- Principle: tests define expected behavior — fix source if it diverges

Update the repo structure section to include `e2e/` and test files. Add test commands to the development commands listing.
