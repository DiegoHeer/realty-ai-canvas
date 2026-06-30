use `bun` or `bunx`. dont use `npx` or `npm`.
This project implements i18n for all texts visible to user (except for data fields), see `packages/i18n/src/`.

## Workflow

- New feature → create a worktree; develop and test there (Playwright for UI).
- At milestones / on completion → push to GitHub with `gh`.
- Front-end changes → spawn `bun run web -p <PORT>` and share the URL so the owner can see it live.

## Storage

Persistent storage is AsyncStorage only, wrapped in `apps/mobile/src/lib/storage.ts`. All reads/writes are best-effort (failures resolve to a safe default, never throw). Keys live under the `realty:` namespace — add new ones to `StorageKeys`.

- **Single value** (e.g. a preference): use `loadJSON`/`saveJSON`/`removeKey` directly. See `appearance.ts`, `i18n.ts`.
- **MRU list** (recent searches/views): use `createPersistedListStore({ key, limit, idOf })` from `persisted-list-store.ts`. It hydrates from disk on load, dedupes + caps on every add, and exposes a `use()` React hook. See `recent-searches.ts`, `recent-views.ts`.

Don't use SecureStore/SQLite/MMKV/filesystem. React Query (`packages/data`) is in-memory only — not persisted.

**Exception:** JWT tokens (sensitive credentials) use SecureStore via `apps/mobile/src/lib/secure-tokens.ts` — the sole exception to the AsyncStorage-only rule.

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

- Web export is built against the staging API (`EXPO_PUBLIC_API_URL=https://api-staging.realty-ai.nl`). Mocks have been removed, so listing screenshots reflect **live data** and are not fully deterministic — treat the data-driven specs (explore/map/listing-detail) as smoke checks and expect to regenerate their baselines.
- Baselines live in `e2e/screenshots/` and are committed to git.
- External images are intercepted and replaced with empty responses to reduce variance.
- After intentional UI changes, run `bun run test:update-snapshots` and commit the new baselines.

### Principle

Tests define expected behavior. If source code produces results that diverge from what's correct, fix the source code — don't weaken the tests.

## CI

Three GitHub Actions workflows run on every push to `main` and every PR:

| Workflow | File | What it runs | Blocking? |
|----------|------|-------------|-----------|
| Lint & Typecheck | `.github/workflows/lint.yml` | `bun run lint` + `bun run typecheck` | Yes |
| Tests | `.github/workflows/test.yml` | `bun run test` (all Jest suites) | Yes |
| Visual Regression | `.github/workflows/visual.yml` | Playwright against Expo web export | No (warn only) |

- All workflows use `oven-sh/setup-bun@v2` and `bun install --frozen-lockfile`.
- Concurrency groups cancel in-progress runs on the same PR.
- Playwright uploads its HTML report as a build artifact on every run (14-day retention).
- Visual regression baselines may differ between local (macOS) and CI (Ubuntu) due to font rendering. Regenerate baselines in CI if needed.
