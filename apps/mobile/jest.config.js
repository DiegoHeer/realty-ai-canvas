/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Reanimated v4's mock pulls in react-native-worklets, whose `.native`
  // sources throw under Jest (no native runtime). Worklets ships a resolver
  // that drops the `.native` extension so the JS-safe variant loads instead.
  resolver: require.resolve('react-native-worklets/jest/resolver.js'),
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  roots: ['<rootDir>/src', '<rootDir>/../../packages/ui/src', '<rootDir>/../../packages/data/src'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts?(x)',
    '<rootDir>/../../packages/ui/src/**/__tests__/**/*.test.ts?(x)',
    '<rootDir>/../../packages/data/src/**/__tests__/**/*.test.ts?(x)',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?(-.*)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@realty/.*|nativewind|react-native-css-interop|react-native-reanimated|react-native-worklets)/)',
  ],
  moduleNameMapper: {
    // CSS imports (global.css, maplibre-gl, *.module.css) have no behavior in
    // unit tests — stub them so they don't get parsed as JS. Must precede the
    // `@/` alias so `@/global.css` resolves here rather than to the real file.
    '\\.css$': '<rootDir>/jest/css-stub.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@realty/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@realty/data$': '<rootDir>/../../packages/data/src/index.ts',
    '^@realty/i18n$': '<rootDir>/../../packages/i18n/src/index.ts',
    '^@realty/ui$': '<rootDir>/../../packages/ui/src/index.ts',
  },
};
