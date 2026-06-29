---
name: playwright-macos
description: >-
  Visually test a feature on macOS by driving a real page with the Playwright MCP browser
  (mcp__playwright__*) backed by Google Chrome, then eyeballing screenshots. Use when asked to
  "look at the site", screenshot a page, click through UI, or confirm something *renders/behaves*
  in a browser on this Mac. Covers the macOS prerequisite (the MCP defaults to the `chrome`
  channel, so Google Chrome must be installed — `playwright install chrome` fails without a
  password), the navigate → snapshot → screenshot → Read loop, and the off-screen-element /
  profile-lock / screenshot-cleanup gotchas. For this repo's data-flow assertions (network/DOM/
  pixel rigor against the Expo web app) use `verifier-web`; this skill is the Chrome-on-macOS
  setup + visual-inspection layer underneath it.
---

# Visual testing with Playwright + Chrome on macOS

The Playwright MCP (`mcp__playwright__*`) drives a **real browser** so you can see what a user sees:
navigate to a URL, click/type, take screenshots, and `Read` those screenshots back to judge layout,
state, and rendering. This skill makes that work reliably on **macOS**, where the one recurring
blocker is the browser binary itself.

Use `bun`/`bunx`, never `npm`/`npx` (project rule). Always serve over **HTTP** — `file://` is blocked.

## 0. Prerequisite — Google Chrome must be installed (the #1 macOS failure)

This machine's MCP runs `bunx @playwright/mcp@latest` with **no `--browser` flag**, so it defaults
to the **`chrome` channel** and looks for `/Applications/Google Chrome.app`. If Chrome is missing,
the very first `browser_navigate` fails with:

```
Chromium distribution 'chrome' is not found at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
Run "npx playwright install chrome"
```

**Do NOT follow that suggestion.** `playwright install chrome` installs the *branded* channel via the
OS and tries to `sudo` for system deps — in this non-interactive shell it dies with
`sudo: a terminal is required to read the password`.

**Fix (preferred): install real Google Chrome via Homebrew** — no password prompt, lands at the path
the MCP expects:

```bash
brew install --cask google-chrome        # ~1 min download; installs to /Applications
```

Then **re-run the same `browser_navigate`** — it succeeds with no further config.

Check first / verify after:

```bash
ls -d "/Applications/Google Chrome.app" 2>/dev/null && \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version
```

> **Alternative (no admin, no system Chrome):** point the MCP at Playwright's *bundled* Chromium
> instead. Edit the `playwright` server's `args` in `~/.claude.json` to `["@playwright/mcp@latest",
> "--browser", "chromium"]`, then `bunx playwright install chromium` (downloads to the Playwright
> cache, **no sudo**). Use this only if you can't or won't install Google Chrome; it changes a
> user-level config file, so prefer the brew cask for a one-off.

## 1. The visual loop: navigate → snapshot → act → screenshot → Read

```
browser_navigate   → load the page over http://localhost:<port> (check it's serving first, below)
browser_snapshot   → accessibility tree with [ref=eNN] handles + (boxes:true) bounding boxes
browser_click/type → act on a ref from the snapshot
browser_take_screenshot → PNG of the result
Read <that png>    → actually look at it and describe what changed
```

**Confirm something is serving before you navigate** (a blank/failed page wastes a round-trip):

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" --max-time 4 http://localhost:8090
```

**Always `Read` the screenshot you take.** The screenshot tool only *saves* the file — you have to
open it to judge the result. Pair a before/after pair around any action you want to prove changed
something (e.g. clicking a marker should pop a detail card).

**Prefer `browser_snapshot` over screenshots for *acting*.** The snapshot gives stable `[ref=eNN]`
handles and the visible text/labels; screenshots are for *seeing*. Pass `boxes: true` (and a small
`depth:`) to get bounding boxes when you need to reason about what's on-screen vs. clipped.

## 2. macOS / Chrome gotchas (each cost a real failure here)

**"element is outside of the viewport" → click timeout.** Many elements (notably MapLibre map
markers) report DOM positions far outside the 1200×~900 viewport even when they look visible.
Clicking such a ref times out after retrying scroll-into-view. Fix: from a `boxes:true` snapshot,
pick a target whose box is **inside** the viewport (`0 ≤ x ≤ ~1200`, `44 ≤ y ≤ ~940`), or pan/zoom
the page first so the target enters the viewport. (Verified: clicking an in-viewport `€600k` marker
popped the listing card; an off-screen `€435k` marker timed out.)

**Profile lock — `Browser is already in use for …/mcp-chrome-<id>`.** A stale Chrome holds the
profile dir. Fix by **explicit PID**, then remove the lock files, then re-navigate:

```bash
lsof "/Users/$USER/Library/Caches/ms-playwright/mcp-chrome-"*/Singleton* 2>/dev/null   # find PID
kill -9 <pid>
rm -f "/Users/$USER/Library/Caches/ms-playwright/mcp-chrome-"*/Singleton*
```

> **Never `pkill -f "mcp-chrome…"` / `pkill -f "<your own pattern>"`** — the pattern matches the shell
> running your command and kills your own shell (exit 144). Kill by explicit PID only.

**Screenshots land in an allowed root, not the scratchpad.** Passing a bare filename to
`browser_take_screenshot` writes to the **repo root** (e.g. `./after-click.png`), and
`browser_snapshot`'s `filename` writes under **`.playwright-mcp/`**. The scratchpad is *outside*
allowed roots ("File access denied"). So: pass a bare filename, `Read` it, then **delete it in
cleanup**. `.playwright-mcp/` is gitignored; the **repo root is not**, so root-level PNGs show up in
`git status` and must be removed.

## 3. Cleanup (always)

```bash
git status --porcelain | rg -i 'png$'      # find stray screenshots you wrote to the repo root
rm -f after-click.png before-click.png ...  # remove them
# Close the browser when done:  mcp__playwright__browser_close
```

Leave any dev server the user started running unless you started it yourself.

## Relationship to the other verifier skills

- **`playwright-macos` (this skill)** — get Chrome working on macOS and run the *visual* loop
  (screenshot → look → judge). The right tool when the goal is "does it look/behave right in a
  browser."
- **`verifier-web`** — the *assertion rigor* for this Expo app: start the web export, drive it, and
  prove data flows via **network requests / DOM / pixel-diffs** (the map is a `<canvas>`, so don't
  eyeball it for data). Reach for it when "did the right request fire / did state update" matters
  more than appearance. It assumes the browser already works — that's this skill's job.
- **`verifier-android`** — native-only behavior (screen transitions, Glide/expo-image, native
  `Alert`, theme/locale re-renders) that the web target can't render at all.
