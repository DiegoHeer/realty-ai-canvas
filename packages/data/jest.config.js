/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@realty/types$': '<rootDir>/../types/src/index.ts',
    '^@realty/i18n$': '<rootDir>/../i18n/src/index.ts',
  },
};
