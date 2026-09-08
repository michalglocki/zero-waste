/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // No jest-expo preset — its fetch polyfill breaks hosted Supabase clients.
  transform: {
    '^.+\\.tsx?$': [
      'babel-jest',
      {
        presets: ['babel-preset-expo'],
        babelrc: false,
        configFile: false,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
