module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts', '**/*-test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { 
      tsconfig: 'tsconfig.json',
      isolatedModules: true, 
      diagnostics: {
        warnOnly: true,
        ignoreCodes: [2322, 2345, 2339, 2769, 2554, 2304, 2502]
      }
    }]
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: ['/node_modules/', '/dist/']
};
