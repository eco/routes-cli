module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/scripts/**/*',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tests/tsconfig.json' }]
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};