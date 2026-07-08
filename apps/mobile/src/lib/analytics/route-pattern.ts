/**
 * Turn expo-router route segments into a stable, PII-free page path.
 *
 * `useSegments()` returns the raw, non-normalized file segments, e.g.
 * `["(tabs)"]`, `["(tabs)", "explore"]`, `["listing", "[id]"]`,
 * `["settings", "privacy"]`. We:
 *   - drop layout **groups** (`(tabs)`) — they aren't part of the URL,
 *   - replace **dynamic** segments (`[id]`, `[...rest]`) with `:id` / `:rest`
 *     so we send the route *pattern*, never a concrete id (no PII, and the
 *     detail page shows up as one row instead of thousands),
 *   - keep static segments as-is.
 *
 * Examples: `["(tabs)"]` → `/`, `["(tabs)","explore"]` → `/explore`,
 * `["listing","[id]"]` → `/listing/:id`, `["settings","privacy"]` →
 * `/settings/privacy`.
 */
export function segmentsToPattern(segments: string[]): string {
  const parts = segments
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    .map((s) =>
      s.startsWith('[') && s.endsWith(']')
        ? ':' + s.slice(1, -1).replace(/^\.\.\./, '')
        : s,
    );
  return '/' + parts.join('/');
}
