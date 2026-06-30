module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/game/__tests__/**/*.test.ts', '**/src/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@game/(.*)$': '<rootDir>/src/game/$1',
  },
};
