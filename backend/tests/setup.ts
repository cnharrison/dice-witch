// Jest setup file
jest.mock('../config', () => {
  return {
    CONFIG: {
      HOST: 'localhost',
      PORT: 3000,
      DISCORD_TOKEN: 'mock-token',
      DISCORD_CLIENT_ID: 'mock-client-id',
      DISCORD_LOG_CHANNEL_ID: 'mock-log-channel',
      DISCORD_ADMIN_ROLE: 'Dice Witch Admin',
      DATABASE_URL: 'mock-database-url'
    }
  };
});

// Mock the database service
jest.mock('../core/services/DatabaseService', () => {
  return {
    DatabaseService: {
      getInstance: jest.fn().mockImplementation(() => ({
        updateOnCommand: jest.fn().mockResolvedValue(null),
        updateUserGuildPermissions: jest.fn().mockResolvedValue(null)
      }))
    }
  };
});

// Mock discord messages
jest.mock('../discord/messages/sendLogEventMessage', () => {
  return {
    sendLogEventMessage: jest.fn().mockResolvedValue(null)
  };
});

// Add global beforeAll and afterAll hooks for test setup and teardown
beforeAll(async () => {
  // Initialize any services or connections needed for integration testing
  jest.setTimeout(30000); // Increase timeout for integration tests
});

afterAll(async () => {
  // Clean up any resources after tests
});

// Suppress console logs/errors during tests unless in debug mode
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

if (process.env.DEBUG !== 'true') {
  console.log = jest.fn();
  console.error = jest.fn();
}

// Restore console functions after tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});