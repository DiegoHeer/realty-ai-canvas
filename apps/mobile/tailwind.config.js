/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    // Shared UI package so its className usage is picked up too.
    '../../packages/ui/src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  // 'class' (not 'media') so the appearance preference can drive dark mode
  // manually via NativeWind's `colorScheme.set()` (see lib/appearance.ts).
  // Under 'media', dark mode is locked to the OS and `colorScheme.set()` throws.
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};
