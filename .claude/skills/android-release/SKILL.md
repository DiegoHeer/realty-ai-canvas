---
name: android-release
description: >-
  Build a signed Android release APK from apps/mobile/android and sideload it onto the
  connected device. Use when asked to "make a release build", produce an installable APK,
  build against a specific API/env (e.g. staging with mocks off), or install/run a release
  build on a phone. Covers the Gradle release build, the EXPO_PUBLIC_* bundle-caching trap,
  the debug-keystore signing caveat, and the adb sideload + launch flow.
---

# Android release build + sideload

This repo is an Expo / React Native (bare workflow, `apps/mobile/android` prebuilt) app.
A "release build" here is a Gradle `assembleRelease` producing a Hermes-bytecode,
minified, signed APK. Use `bun`/`bunx`, never `npm`/`npx` (project rule).

## Project facts (current)

| Thing | Value |
|---|---|
| Android project | `apps/mobile/android` |
| Android package | `com.anonymous.realtyaicanvas` |
| Gradle wrapper | `apps/mobile/android/gradlew` |
| Android SDK | `/home/jeroen/Android/Sdk` (set in `android/local.properties`) |
| `adb` | `/usr/bin/adb` |
| JDK | Java 21 (works) |
| Build config | Hermes on, new arch on, all 4 ABIs (`reactNativeArchitectures` in `gradle.properties`) |
| Release APK out | `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (universal, ~142 MB) |
| Env source | `apps/mobile/.env.local` (gitignored) — `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_USE_MOCKS` |

Re-derive if changed: `grep -E '"package"|"scheme"' apps/mobile/app.json`,
`grep sdk.dir apps/mobile/android/local.properties`.

## ⚠️ Signing caveat — read before calling it a "release"

`app/build.gradle`'s `release` build type signs with the **debug keystore**
(`signingConfig signingConfigs.debug`, the Expo template default). The APK installs and
runs fine for **sideloading / QA / testing**, but it is **NOT Play-Store-uploadable** —
that needs a real upload keystore and a proper `release` signingConfig. Always state this
when handing over a release build. Verify the signer with `apksigner` (step 4).

## How env / mocks work — the build assumes staging + mocks off

`EXPO_PUBLIC_*` vars are **inlined into the JS bundle at build time** from `.env.local`.
Unless the user says otherwise, **build against the staging API with mocks off** —
`apps/mobile/.env.local` should read:

```
EXPO_PUBLIC_API_URL=https://api-staging.realty-ai.nl
EXPO_PUBLIC_USE_MOCKS=false
```

Data flow is gated by `API_URL`, **not** by `USE_MOCKS`:

- `packages/data/src/env.ts`: `USE_LISTING_MOCKS = (API_URL === '')`. With `API_URL` set to
  staging, listings (`/v1/residences`) hit the **live API**, and `/v1/shapes/*` + `/v1/stats/*`
  have **no mock branch at all** — they always hit it.
- `USE_MOCKS` is an **inert export** (only re-exported from `@realty/data`; no runtime
  consumer — `client.ts` branches on `USE_LISTING_MOCKS`). Its value never changes app
  behavior; we set it `false` purely so `.env.local` honestly reflects "talks to staging."
- The **only** way to serve bundled mock data is to leave `API_URL` **empty** (that flips
  `USE_LISTING_MOCKS` on — this is what the CI web export / visual-regression run relies on).
  That is **not** the release-build default.

If you change any `EXPO_PUBLIC_*` var, force a re-bundle (next section).

## 🪤 The bundle-caching trap (the #1 thing that bites)

Gradle does **not** track `EXPO_PUBLIC_*` env vars as task inputs. If you only edit
`.env.local` and re-run `assembleRelease`, the `createBundleReleaseJsAndAssets` task is
marked **UP-TO-DATE** and silently reuses the previous bundle — your env change never
lands in the APK. To force a clean re-bundle, delete its outputs first:

```bash
cd apps/mobile/android
rm -f \
  app/build/generated/assets/react/release/index.android.bundle \
  app/build/intermediates/assets/release/mergeReleaseAssets/index.android.bundle \
  app/build/outputs/apk/release/app-release.apk
```

Native compilation (CMake, in `.cxx/` + `build/`) stays cached, so the rebuild is fast
(~30s vs ~1m40s cold).

## 1. Build the release APK

```bash
# Standard data source = staging + mocks off. Confirm apps/mobile/.env.local reads:
#   EXPO_PUBLIC_API_URL=https://api-staging.realty-ai.nl
#   EXPO_PUBLIC_USE_MOCKS=false
# If you changed any EXPO_PUBLIC_* var, force a re-bundle first (see trap above).

cd apps/mobile/android
./gradlew assembleRelease            # run in background; it can take minutes when cold
```

Run it backgrounded and watch for the terminal line (host `sleep` is blocked — use a
Monitor `until grep -qE "BUILD SUCCESSFUL|BUILD FAILED|FAILURE:"` loop, not polling).
A clean release build is ~1m40s here; an incremental rebundle is ~30s. The bundle step
prints `Writing bundle output to: .../index.android.bundle` and the build ends with
`BUILD SUCCESSFUL`.

## 2. Verify the re-bundle actually took (only if you changed env)

Don't trust that the env change landed — prove it:

```bash
cd apps/mobile/android
md5sum app/build/generated/assets/react/release/index.android.bundle   # must DIFFER from the prior build
grep -E "Task :app:createBundleReleaseJsAndAssets$" <build-log>          # present and NOT "UP-TO-DATE"
grep -nE "env: load .env.local|EXPO_PUBLIC" <build-log>                  # confirms .env.local was loaded
```

If the hash is unchanged or the task was `UP-TO-DATE`, the delete in the trap section
didn't happen — redo it and rebuild.

## 3. Confirm a device is connected

```bash
adb devices -l        # expect e.g. "model:Pixel_10_Pro ... device"
```

If nothing is listed, **stop and ask the user** to plug in / unlock the device (or run
`adb kill-server && adb start-server`). Don't guess.

## 4. (recommended) Verify signature + package metadata

```bash
SDK=/home/jeroen/Android/Sdk
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
"$(ls $SDK/build-tools/*/apksigner | sort -V | tail -1)" verify --print-certs "$APK"
"$(ls $SDK/build-tools/*/aapt2 | sort -V | tail -1)" dump badging "$APK" \
  | grep -E "^package:|targetSdkVersion:|native-code:"
```

Expect `CN=Android Debug` as the signer (the caveat above), `versionName='1.0.0'`,
and `native-code: 'arm64-v8a' 'armeabi-v7a' 'x86' 'x86_64'`.

## 5. Sideload onto the device

```bash
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

`-r` reinstalls keeping app data. This works over an existing debug install because the
**release and debug variants share the debug keystore** (matching signature). If you ever
switch to a real release keystore, the signature won't match a debug install — then either
`adb uninstall com.anonymous.realtyaicanvas` first, or use `adb install -r -d` (allow
downgrade) as appropriate. `versionCode` is `1`; equal codes reinstall fine.

`INSTALL_FAILED_UPDATE_INCOMPATIBLE` / `signatures do not match` → uninstall first.

## 6. Launch + confirm

```bash
PKG=com.anonymous.realtyaicanvas
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1   # launch
adb shell dumpsys package $PKG | grep -E "versionName|versionCode|lastUpdateTime"
```

`lastUpdateTime` should be ~now. The app runs against the **staging API**
(`EXPO_PUBLIC_API_URL=https://api-staging.realty-ai.nl`) baked into the bundle. To watch its
network/logs, use the `verifier-android` skill.

## Cleanup

The assumed baseline for `apps/mobile/.env.local` is **staging + mocks off** (the two lines
in the env section). If you temporarily changed it for a one-off build — pointed
`EXPO_PUBLIC_API_URL` elsewhere, or emptied it to bundle offline mocks — **restore it to that
baseline** afterward and tell the user. (Flipping `USE_MOCKS` does nothing; the real mock
toggle is an empty `API_URL`.)
