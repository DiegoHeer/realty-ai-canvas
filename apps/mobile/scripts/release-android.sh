#!/usr/bin/env bash
# Build a signed (debug-keystore) Android release APK and sideload it onto the
# connected device. Mirrors the steps of the `android-release` Claude skill so
# the process is reproducible from the shell.
#
# Usage:
#   scripts/release-android.sh [--clean] [--no-install]
#
#   --clean       Force-wipe android/build + android/app/build + android/app/.cxx
#                 before building, even if app id hasn't changed. The script
#                 already auto-detects an app id change (see below) and does
#                 this automatically in that case — pass --clean to force it
#                 for other kinds of staleness.
#   --no-install  Build and verify the APK but skip adb install/launch.
#
# Gotcha this script works around: changing the app id / package name
# (app.json "android.package") isn't enough on its own. The React Native
# Gradle Plugin caches the resolved package name in
# android/build/generated/autolinking/autolinking.json (the ROOT project's
# build dir — NOT android/app/build/, which is what you'd normally think to
# clear). If that file goes stale, the generated
# ReactNativeApplicationEntryPoint.java keeps referencing the OLD package's
# BuildConfig and compileReleaseJavaWithJavac fails with "package ... does
# not exist" — even after deleting android/app/build + android/app/.cxx.
# The script compares app.json's package against that cached value and wipes
# all three build dirs automatically when they differ.
#
# Don't use `./gradlew clean` to fix this — on this project's RN new-arch
# setup it fails with a CMake "GLOB mismatch" error, because sibling
# modules' :clean tasks delete codegen dirs that :app's native clean still
# needs. Deleting the build dirs directly (as this script does) sidesteps
# that ordering bug.
#
# NOTE: not Play Store-uploadable — release builds are signed with the Expo
# template's debug keystore (see android/app/build.gradle).

set -euo pipefail

CLEAN=false
INSTALL=true
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=true ;;
    --no-install) INSTALL=false ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$MOBILE_DIR/android"
APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
AUTOLINKING_JSON="$ANDROID_DIR/build/generated/autolinking/autolinking.json"
PKG=$(grep -o '"package"[[:space:]]*:[[:space:]]*"[^"]*"' "$MOBILE_DIR/app.json" | head -1 | grep -o '"[^"]*"$' | tr -d '"')

echo "==> Checking env"
if [ -f "$MOBILE_DIR/.env.local" ]; then
  API_URL=$(grep -E '^EXPO_PUBLIC_API_URL=' "$MOBILE_DIR/.env.local" | cut -d= -f2-)
  echo "    EXPO_PUBLIC_API_URL=${API_URL:-<empty>}"
  if [ -z "${API_URL:-}" ]; then
    echo "    WARNING: API_URL is empty — shapes/stats will be empty and listings won't load." >&2
  fi
else
  echo "    WARNING: $MOBILE_DIR/.env.local not found — build will have no data source." >&2
fi

if $INSTALL; then
  echo "==> Checking device"
  if ! adb devices -l | grep -qE '\bdevice\b'; then
    echo "    No device connected (adb devices -l). Plug in / unlock the device, or re-run with --no-install." >&2
    exit 1
  fi
  adb devices -l | grep -E '\bdevice\b'
fi

echo "==> Syncing native project from app.json / assets (expo prebuild)"
(cd "$MOBILE_DIR" && bunx expo prebuild --platform android)

if [ -f "$AUTOLINKING_JSON" ]; then
  CACHED_PKG=$(grep -o '"packageName":"[^"]*"' "$AUTOLINKING_JSON" | head -1 | cut -d'"' -f4)
  if [ -n "$CACHED_PKG" ] && [ "$CACHED_PKG" != "$PKG" ]; then
    echo "    App id changed ($CACHED_PKG -> $PKG) — forcing clean to avoid stale autolinking codegen"
    CLEAN=true
  fi
fi

if $CLEAN; then
  echo "==> Wiping android/build + app/build + app/.cxx"
  rm -rf "$ANDROID_DIR/build" "$ANDROID_DIR/app/build" "$ANDROID_DIR/app/.cxx"
fi

echo "==> Building release APK"
(cd "$ANDROID_DIR" && ./gradlew assembleRelease)

echo "==> Verifying signature + metadata"
SDK_DIR=$(grep -E '^sdk\.dir=' "$ANDROID_DIR/local.properties" | cut -d= -f2-)
APKSIGNER=$(ls "$SDK_DIR"/build-tools/*/apksigner | sort -V | tail -1)
AAPT2=$(ls "$SDK_DIR"/build-tools/*/aapt2 | sort -V | tail -1)
"$APKSIGNER" verify --print-certs "$APK"
"$AAPT2" dump badging "$APK" | grep -E "^package:|targetSdkVersion:|native-code:"

if $INSTALL; then
  echo "==> Installing on device"
  adb install -r "$APK"
  echo "==> Launching"
  adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
  sleep 2
  adb shell dumpsys package "$PKG" | grep -E "versionName|versionCode|lastUpdateTime"
fi

echo "==> Done: $APK"
