import { Config } from 'jest';

export default {
  displayName: 'checkout-step',
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: ['main.ts', '!main.test.ts', '!jest.config.ts'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
} as Config;
