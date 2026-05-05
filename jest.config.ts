import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/main.ts',
    '!src/**/*.d.ts',
    '!src/**/*.module.ts',
    '!src/scripts/**',
  ],
  coverageThreshold: {
    global: { branches: 10, functions: 15, lines: 20, statements: 20 },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^ora$': '<rootDir>/tests/__mocks__/ora.ts',
    '^inquirer$': '<rootDir>/tests/__mocks__/inquirer.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup/register-chain-handlers.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tests/tsconfig.json' }],
  },
};

export default config;
