/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@realty/types$': '<rootDir>/../types/src/index.ts',
    'den-haag-areas\\.json$': '<rootDir>/src/__mocks__/den-haag-areas.json',
  },
};
