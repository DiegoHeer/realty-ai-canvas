---
name: verifier-android
description: >-
  Test/verify a change on the real Android device (or emulator) by running the app,
  driving its UI over adb, and reading device logs. Use when confirming a fix works,
  reproducing a crash, or checking behavior that only exists natively (react-native-screens
  transitions, expo-image/Glide, native Alert dialogs, theme/locale changes) — i.e.
  anything Jest mocks out and the web export can't render. Also the evidence-capture
  protocol the `verify` skill should use for this repo's Android GUI surface.
---

# Verifying on the connected Android device

This repo is an Expo / React Native app. **Jest mocks every native module and the web
export (react-native-web) has no native screen stack, Glide, or `Alert`** — so native
behavior (screen transitions, image bitmaps, native dialogs, `Appearance`/theme,
locale-driven re-renders) is only real on a device. Verify those here, on hardware.

Use `bun`/`bunx`, never `npm`/`npx` (project rule).

## Project facts (current)

| Thing | Value |
|---|---|
| Android package | `com.anonymous.realtyaicanvas` |
| Deep-link scheme | `realtyaicanvas://` (e.g. `realtyaicanvas://profile`, `realtyaicanvas://settings/language`) |
| Dev runner | `expo run:android` (dev build + Metro; check the port, e.g. `-p 8082`) |
| `adb` | `/usr/bin/adb` |
| Screen size | `adb shell wm size` (was `1280x2856` — coordinates are physical px) |

Re-derive these if they change: `grep -E '"package"|"scheme"' apps/mobile/app.json`.

## Preconditions

```bash
adb devices                                   # expect a device/emulator listed
adb shell pidof com.anonymous.realtyaicanvas  # app running? (Metro must be up too)
ps aux | grep -i "expo run:android" | grep -v grep   # confirm Metro/dev build is live
```
`
If nothing is connected or `expo run:android` isn't running, **stop and ask the user**
to plug in a device / start the dev build — don't try to cold-build it yourself.

## 1. Load the code you're testing onto the device

Metro Fast Refresh auto-applies JS edits, but for a deterministic test do a full reload
so the device fetches a fresh bundle:

```bash
adb shell am force-stop com.anonymous.realtyaicanvas
adb shell am start -W -a android.intent.action.VIEW \
  -d "realtyaicanvas://profile" com.anonymous.realtyaicanvas
```

Wait for the JS to render (host `sleep` is blocked — use device-side `adb shell sleep`
or poll the UI tree):

```bash
for i in $(seq 1 40); do
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml "$SCRATCH/ui.xml" >/dev/null 2>&1
  grep -q 'text="Profile"\|text="Profiel"' "$SCRATCH/ui.xml" && { echo READY; break; }
  adb shell sleep 1 >/dev/null 2>&1
done
```

> **Stale-bundle gotcha (cost me a confused test):** Fast Refresh / Metro's transform
> cache can serve an *old* version of a file. Tell-tale sign: a `ReferenceError: Property
> 'X' doesn't exist` for a symbol the **current source no longer references** (e.g. a
> just-removed import). A force-stop+relaunch fetches Metro's bundle, which may still be
> stale. The real fix is a clean Metro restart (`bun expo start -c`, or re-run
> `expo run:android`). **Don't restart the user's Metro without asking** — it interrupts
> their session and triggers a slow rebuild.

## 2. Drive the UI deterministically (coordinates from the a11y tree, not guesses)

```bash
adb shell uiautomator dump /sdcard/ui.xml >/dev/null && adb pull /sdcard/ui.xml "$SCRATCH/ui.xml"
# find a row's bounds: text="…"  …  bounds="[x1,y1][x2,y2]"
grep -oE 'text="[^"]*Language[^"]*"[^>]*bounds="[^"]*"' "$SCRATCH/ui.xml"
# tap the center of [x1,y1][x2,y2]:
adb shell input tap $(( (x1+x2)/2 )) $(( (y1+y2)/2 ))
```

- **Emoji/flag prefixes** (e.g. `🇬🇧 English`, `🌙 Donker`) come through as XML entities
  (`&#127468;…`). Match a **substring** (`English`, `Donker`), not the whole label.
- **Deep links** jump straight to a route: `adb shell am start -a android.intent.action.VIEW
  -d "realtyaicanvas://settings/appearance" com.anonymous.realtyaicanvas`. But to test a
  flow that calls `router.back()`, navigate from the **real screen** (tap in) so there's a
  back stack to pop — a deep-linked screen may have nowhere to go back to.
- **Screenshots:** `adb exec-out screencap -p > "$SCRATCH/shot.png"` then `Read` it.
  (Playwright MCP is for the *web* export, not the device.) `screencap >` writes to the
  shell's CWD — point it at scratch and clean up; never leave PNGs in the repo.

## 3. Capture evidence — crashes and JS errors

```bash
adb logcat -b crash -c                # clear the dedicated CRASH buffer before the test
adb logcat -c                         # clear the main buffer too
# … drive the repro …
adb logcat -b crash -d                # native crashes: FATAL EXCEPTION + full Java stack
adb logcat -d | grep ReactNativeJS    # JS errors / console.error / red-box (componentStack)
```

- **Native crash** (app vanishes, no red box) → it's in `adb logcat -b crash`. There is no
  JS stack; read the Java stack (e.g. `com.swmansion.rnscreens.ScreenStack.drawAndRelease`,
  `expo-image`, `Glide`).
- **Detect a crash even if you missed the moment:** snapshot `adb shell pidof <pkg>` before
  and after the action; a changed/missing pid means it died and relaunched. The crash
  buffer is the authoritative signal (a recycled pid can mask a change).
- System noise to ignore: `SensorReceiverBase`, `pixel-thermal`, `NearbyConnections`,
  other apps' PIDs. Filter to your package's PID when in doubt.

## 4. Rigor — make a clean result trustworthy

- **A/B the fix.** First reproduce the bug on the **unfixed** build with your exact taps and
  confirm the crash/error appears — that validates your repro. *Then* apply the fix, reload,
  and confirm it's clean with the *same* taps. A clean post-fix run only means something if
  the pre-fix run provably failed.
- **Prove the flow actually ran.** "No crash" + a tap that did nothing = false pass. Confirm
  the effect landed (the language really changed, the screen navigated, the value persisted)
  via a follow-up screenshot / `uiautomator dump`.
- **Separate confounds.** A failure during the flow may be unrelated (e.g. another tab's
  uncommitted WIP throwing on re-render). Check `git status` / `git diff` for code you
  didn't touch before blaming your change.

## 5. Cleanup

- `rm` any screenshots that landed in the repo root (`git status` to check).
- Leave the device in a usable state, or tell the user it needs a reload.
- Don't kill the user's `expo run:android` / Metro.

## When NOT to use the device

Web-renderable UI (layout, static content, icons that aren't native) is faster to check via
the web export + Playwright MCP: `EXPO_PUBLIC_USE_MOCKS=true bun run export:web`, serve
`apps/mobile/dist` on :3000, drive with `mcp__playwright__*`. Reach for the **device** the
moment native behavior is involved. See `memory/rnscreens-recycled-bitmap-crash.md` for a
worked example (a crash invisible to both Jest and the web export).
