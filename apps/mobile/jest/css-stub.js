// Stub for CSS imports under Jest. NativeWind's `global.css`, the maplibre-gl
// stylesheet and `*.module.css` files have no runtime behavior in unit tests;
// Metro/Expo handle the real bundling. Mapped via `moduleNameMapper` so that
// importing e.g. `@/constants/theme` (which side-effect-imports global.css)
// doesn't try to parse `@tailwind base;` as JavaScript.
module.exports = {};
