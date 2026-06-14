# Realty AI Canvas

App-first real-estate app (map + house listings) built with **Expo + Expo Router**,
exporting to the web for desktop users. Bun workspaces monorepo.

> Working name — may change later.

## Stack

| Concern    | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Runtime    | Expo SDK 56, React 19, React Native 0.85 (New Architecture)            |
| Routing    | Expo Router (file-based, typed routes, static web output)              |
| Maps       | MapLibre — `@maplibre/maplibre-react-native` (native) / `react-map-gl` + `maplibre-gl` (web) |
| Styling    | NativeWind (Tailwind CSS) — shared across native & web                 |
| Data       | TanStack Query over a typed API client (mock data until the API lands) |
| i18n       | i18next + react-i18next, device language via `expo-localization`       |
| Pkg manager| Bun (hoisted linker — see `bunfig.toml`)                               |

## Layout

```
.
├── apps/
│   └── mobile/                # Expo app (iOS, Android, web)
│       └── src/
│           ├── app/           # Expo Router routes
│           │   ├── (tabs)/    #   index = Map, explore = Listings
│           │   └── listing/[id].tsx   # detail screen
│           └── components/    # listing-map.tsx (native) + listing-map.web.tsx
├── packages/
│   ├── types/                 # @realty/types — shared domain types
│   ├── data/                  # @realty/data — API client, TanStack Query hooks, mocks
│   ├── i18n/                  # @realty/i18n  — i18next setup + locale resources
│   └── ui/                    # @realty/ui   — cross-platform components (ListingCard)
├── bunfig.toml                # hoisted linker (required for Expo/Metro/Babel)
└── tsconfig.base.json
```

Packages are consumed as TypeScript source via Bun workspaces — no build step.

## Requirements

- **Node ≥ 20.19.4** (Expo SDK 56). See `.nvmrc` (Node 22).
- **Bun ≥ 1.3**

## Getting started

```bash
bun install

# Web (desktop) — runs in a browser
bun run web

# Native dev server (then press i / a, or scan with a dev build)
bun run start
```

### Native maps need a development build

MapLibre's native module is **not** in Expo Go. To run on a device/simulator:

```bash
bunx expo run:ios      # or: bunx expo run:android
```

The web build works in any browser with no extra setup.

## Useful scripts (root)

| Command               | What it does                                  |
| --------------------- | --------------------------------------------- |
| `bun run web`         | Start the web dev server                      |
| `bun run start`       | Start the Expo dev server (native)            |
| `bun run ios` / `android` | Build & run a native dev build            |
| `bun run export:web`  | Static web export to `apps/mobile/dist`       |
| `bun run typecheck`   | Typecheck every workspace                     |
| `bun run lint`        | Lint the app                                  |

## Localization

- All user-facing text goes through i18next; **data fields** (titles, descriptions,
  addresses, prices) are rendered as-is and not translated.
- The app picks the **device language** on launch (`apps/mobile/src/i18n.ts` reads
  `expo-localization`), falling back to English when the locale isn't supported.
- Locale resources live in `packages/i18n/src/locales/` (`en.json`, `nl.json`).
  `en.json` is the source of truth and types the `t()` keys.

Add a language:

1. Add `xx.json` under `packages/i18n/src/locales/` (mirror `en.json`).
2. Register it in `packages/i18n/src/index.ts` (`resources` + `supportedLanguages`).

In components: `const { t, i18n } = useTranslation()` from `@realty/i18n` (app) or
`react-i18next` (shared `ui` package), then `t('listings.title')`. Pass
`i18n.language` to `formatPrice(...)` for locale-aware currency formatting.

## Connecting the real API

Listings currently come from bundled mock data (`packages/data/src/mocks.ts`).
When the backend is ready, copy `apps/mobile/.env.example` to `apps/mobile/.env` and set:

```bash
EXPO_PUBLIC_API_URL=https://your-api.example.com
```

The client (`packages/data/src/client.ts`) expects `GET /listings` and
`GET /listings/:id` returning the `Listing` shape from `@realty/types`. Adjust
the request paths/params there to match the real contract.


https://www.troostwijkauctions.com/l/apple-macbook-air-13-3%E2%80%9D-apple-m2-16-gb-ram-500-gb-nvme-laptop-A1-38887-4300
