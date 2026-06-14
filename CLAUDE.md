use `bun` or `bunx`. dont use `npx` or `npm`.
This project implements i18n for all texts visible to user (except for data fields), see `packages/i18n/src/`.

## Testing

**Test runner:** Jest via `jest-expo` for all unit and component tests.
**Component testing:** `@testing-library/react-native` (RNTL) v14 — tests what users see and interact with.
**Visual regression:** Playwright with `toHaveScreenshot()` against the Expo static web export.

### Commands

```bash
bun test                        # Run all Jest tests across all packages
bun run test:e2e                # Run Playwright visual regression tests
bun run test:update-snapshots   # Regenerate Playwright screenshot baselines
```

### Test file convention

Tests live in `src/__tests__/` colocated within each package, named `<name>.test.ts(x)`:

```
packages/data/src/__tests__/       # Unit: format, residences, client; Integration: query hooks
packages/i18n/src/__tests__/       # Unit: initI18n, isSupportedLanguage, locale completeness
packages/ui/src/__tests__/         # Component: ListingCard
apps/mobile/src/__tests__/         # Unit: area-polygons; Component: screens
e2e/tests/                         # Playwright visual regression specs
```

### Module mocks

`apps/mobile/test-setup.ts` mocks native modules for component tests: `expo-router`, `expo-image`, `expo-web-browser`, `react-native-reanimated`, `react-native-safe-area-context`, `@maplibre/maplibre-react-native`, `nativewind`.

### Visual regression

- Web export is built with `EXPO_PUBLIC_USE_MOCKS=true` for deterministic screenshots.
- Baselines live in `e2e/screenshots/` and are committed to git.
- External images (Unsplash) are intercepted and replaced with empty responses for determinism.
- After intentional UI changes, run `bun run test:update-snapshots` and commit the new baselines.

### Principle

Tests define expected behavior. If source code produces results that diverge from what's correct, fix the source code — don't weaken the tests.
