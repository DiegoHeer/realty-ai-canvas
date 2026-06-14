/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  roots: ['<rootDir>/src', '<rootDir>/../../packages/ui/src'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts?(x)',
    '<rootDir>/../../packages/ui/src/**/__tests__/**/*.test.ts?(x)',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?(-.*)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@realty/.*|nativewind|react-native-css-interop)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@realty/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@realty/data$': '<rootDir>/../../packages/data/src/index.ts',
    '^@realty/i18n$': '<rootDir>/../../packages/i18n/src/index.ts',
    '^@realty/ui$': '<rootDir>/../../packages/ui/src/index.ts',
    'den-haag-areas\\.json$': '<rootDir>/../../packages/data/src/__mocks__/den-haag-areas.json',
  },
};
