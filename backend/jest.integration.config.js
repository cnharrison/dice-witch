const config = require('./jest.config');

module.exports = {
  ...config,
  testMatch: ['**/?(*.)+(integration).ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!discord\\.js)'
  ]
};