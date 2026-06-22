---
name: verifier-web
description: >-
  Test/verify a change by running the Expo web export and driving it with the Playwright
  MCP browser (mcp__playwright__*). Use to confirm data flows, map interactions, transient
  UI (spinners, animations), and web-renderable layout actually work end-to-end against real
  or mocked data — anything Jest only renders shallowly. The web map is a <canvas>, so assert
  via network requests, the DOM (inputs/text), and screenshot pixel-diffs, not by reading the
  canvas. For native-only behavior (screen transitions, Glide, native Alert) use
  `verifier-android` instead.
---

# Verifying in the browser (Expo web + Playwright MCP)

This repo is an Expo / React Native app with a web target (`react-native-web` + `react-map-gl`).
The web export renders real React state and fires real network requests, so it's the fastest way
to verify **data flows, map drill-downs, search, transient UI (spinners/pulses), and layout** —
without a device. Reach for `verifier-android` only when behavior is native-only.

Use `bun`/`bunx`, never `npm`/`npx` (project rule). Put temp files in the scratchpad, never the repo.

## Project facts (current)

| Thing | Value |
|---|---|
| Web dev server | `cd apps/mobile && CI=1 BROWSER=none bunx expo start --web --port <FREE>` |
| Free port | **8081 is usually taken by another Expo project ("mobius-chess")** — pick another, e.g. `8090` |
| API proxy | Metro proxies `/realty-api/*` → `EXPO_PUBLIC_API_URL` (`apps/mobile/metro.config.js`) — dodges CORS in web dev |
| Real data | `apps/mobile/.env.local` sets `EXPO_PUBLIC_API_URL=https://api-staging.realty-ai.nl`. `getCities`/`getAreas`/`getStats` gate on `API_URL` (so they hit staging); only **listings** mock via `USE_MOCKS` |
| Deterministic visuals | static export with mocks: `EXPO_PUBLIC_USE_MOCKS=true bun run export:web` → serve `apps/mobile/dist` (this is what the Playwright visual-regression e2e uses) |
| The map | MapLibre GL `<canvas>` — **not DOM-inspectable**; assert via network/DOM/pixels |

Re-derive if unsure: `rg 'PROXY_PREFIX|PROXY_TARGET' apps/mobile/metro.config.js`, `rg 'API_URL|USE_MOCKS' packages/data/src/env.ts`.

## Pick a mode

- **Real-data flow** (did tapping a city fetch its neighborhoods? does search resolve?) → **dev server** so requests proxy to staging. Verify by watching the network.
- **Deterministic visuals / pixel baselines** → **static export with mocks** (no network variance). This is the `bun run test:e2e` path.

## 1. Start the web server (on a free port)

```bash
cd apps/mobile && CI=1 BROWSER=none bunx expo start --web --port 8090   # run_in_background: true
```

Wait for it, then confirm the proxy reaches staging (don't trust "port up" alone — the first
page load is what triggers the bundle build):

```bash
for i in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:8090)" = 200 ] && break
  sleep 3
done
curl -s -o /dev/null -w 'proxy: %{http_code}\n' 'http://localhost:8090/realty-api/v1/shapes/cities?limit=1&offset=0'
```

> **CI-mode rebuild gotcha:** `CI=1` disables Metro's file watcher / hot reload (not on-demand
> bundling). After editing code, a fresh `browser_navigate` *usually* rebuilds the bundle, but the
> reliable move is to **restart the dev server** so your edits are definitely bundled. Don't rely
> on reload to pick up changes.

## 2. Drive it with the Playwright MCP

- `mcp__playwright__browser_navigate` to `http://localhost:<port>` — **`file://` is blocked**, always serve over HTTP.
- Tools you'll use: `browser_navigate`, `browser_evaluate`, `browser_network_requests`,
  `browser_take_screenshot`, `browser_wait_for`, `browser_snapshot`, `browser_close`.

> **Profile-lock gotcha:** `Error: Browser is already in use for …/mcp-chrome-<id>` means a stale
> Chrome holds the profile. Fix by PID (see Cleanup) + `rm …/mcp-chrome-<id>/Singleton*`, then
> re-navigate. **Don't `pkill -f "mcp-chrome…"`** — the pattern matches the shell running your
> command and kills your own shell (exit 144). Kill by explicit PID.

## 3. Assert — the map is a canvas, so don't screenshot-and-eyeball

Pick the cheapest signal that proves the behavior:

**Network (best for data flows).** `browser_network_requests` with a `filter` regex:
```
filter: "/v1/shapes/(cities|neighborhoods)"   static: false
```
e.g. on open you should see `…/shapes/cities?limit=200&offset=0` then `…offset=200` (pagination),
and a map tap should fire `…/shapes/neighborhoods?city=<code>`. A *different* code on a second tap
proves the hit-test discriminates.

**DOM (for inputs / text / element presence)** via `browser_evaluate`:
```js
() => document.querySelector('input')?.placeholder   // e.g. "Search" → city name
```
A transient element (loading chip) can be detected by an svg-count delta or a computed style
(`getComputedStyle(node).borderTopLeftRadius` for a `rounded-full` chip) inside a poll loop.

**Map clicks** — dispatch synthetic events on the canvas (react-map-gl reads them and computes
`lngLat`). Use **`.maplibregl-canvas`** — `.maplibregl-canvas-container` reports `height: 0`:
```js
() => {
  const el = document.querySelector('.maplibregl-canvas');
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + r.width*0.5 + 80), y = Math.round(r.top + r.height*0.5 + 40);
  const o = {bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,view:window,pointerId:1,isPrimary:true,pointerType:'mouse'};
  for (const [C,t] of [[PointerEvent,'pointerdown'],[MouseEvent,'mousedown'],[PointerEvent,'pointerup'],[MouseEvent,'mouseup'],[MouseEvent,'click']]) el.dispatchEvent(new C(t,o));
}
```

**Observe transient UI (spinner, pulse)** — it's gone before a screenshot round-trips. Throttle the
response in `browser_evaluate` so the loading state persists, and clear caches to force a fetch
(area data is cached in AsyncStorage → `localStorage` on web):
```js
() => {
  localStorage.clear();                          // force a fresh fetch (skip the disk cache)
  const orig = window.fetch;
  window.fetch = (...a) => { const u = typeof a[0]==='string'?a[0]:a[0]?.url||'';
    const p = orig.apply(window,a);
    return u.includes('/shapes/neighborhoods') ? p.then(r=>new Promise(res=>setTimeout(()=>res(r),6000))) : p; };
}
```

**Prove an animation** — screenshot two frames during the throttled window, then pixel-diff them
(camera/markers are static, so the diff isolates the animating element):
```bash
python3 -c "
from PIL import Image; import numpy as np
a=np.asarray(Image.open('f1.png').convert('RGB')).astype(int); b=np.asarray(Image.open('f2.png').convert('RGB')).astype(int)
d=abs(a-b).mean(2); H,W=d.shape
print('central diff %.1f'%d[int(H*.22):int(H*.92), int(W*.33):int(W*.66)].mean())"   # ~0 = not animating
```

> **Screenshots save to an allowed root** (repo root or `.playwright-mcp/`), **not** the scratchpad
> ("File access denied … outside allowed roots"). Pass a bare filename, find the file, `Read` it,
> and delete it in cleanup.

## 4. Rigor — make a clean result trustworthy

- **Prove the flow ran**, don't just check "no error": read the placeholder/text/marker that the
  action should change, or assert the expected request fired with the right params.
- **A/B when fixing a bug:** confirm the failing behavior on the unfixed build with the same steps,
  then confirm the fix with the same steps.
- **Mind the caches:** React Query (in-memory, `staleTime: Infinity`) and AsyncStorage→`localStorage`
  both suppress refetches — a "no request" can be a cache hit, not a bug. `localStorage.clear()` +
  reload for a cold run.
- **Separate confounds:** failures during a flow may be unrelated WIP. Check `git status`/`git diff`
  for code you didn't touch before blaming your change. (This repo currently has unrelated failing
  settings tests — don't chase them.)

## 5. Cleanup (always)

- **Stop the dev server with `TaskStop <task_id>`** — Expo supervises and respawns its listener, so
  `kill <pid>` alone doesn't stick. Belt-and-suspenders: `for p in $(lsof -ti tcp:8090); do kill -9 "$p"; done`.
- **Never `pkill -f "<pattern>"`** when the pattern appears in your own command — it kills your shell
  (exit 144). Kill by explicit PID.
- **Leave other servers alone** — e.g. the project on `:8081` is the user's; verify it's still up.
- `rm` every screenshot that landed in the repo root (`git status` to check). `.playwright-mcp/` is gitignored.

## When NOT to use the browser

Native-only behavior — screen transitions (`react-native-screens`), `expo-image`/Glide bitmaps,
native `Alert`, `Appearance`/theme, locale-driven native re-renders — isn't real on web. Use
`verifier-android`. See also `memory/web-verify-workflow.md` for the condensed version of this.
