jest.mock('../config', () => {
  return {
    CONFIG: {
      HOST: 'localhost',
      PORT: 3000,
      DISCORD_TOKEN: 'mock-token',
      DISCORD_CLIENT_ID: 'mock-client-id',
      DISCORD_LOG_CHANNEL_ID: 'mock-log-channel',
      DISCORD_ADMIN_ROLE: 'Dice Witch Admin',
      DATABASE_URL: 'mock-database-url',
      dice: {
        canvasPoolSize: 3,
      },
      discord: {
        token: 'mock-token',
        clientId: 'mock-client-id',
        logOutputChannelId: 'mock-log-channel',
        renderErrorChannelId: 'mock-log-channel',
        adminId: 'mock-admin-id',
        supportServerLink: 'https://example.com/support',
        inviteLink: 'https://example.com/invite',
        clientSecret: '',
      },
      botListAuth: {
        discordbotlist: '',
        topgg: '',
        dbots: '',
      },
      botPath: '/app',
    }
  };
});

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

jest.mock('../discord/messages/sendLogEventMessage', () => {
  return {
    sendLogEventMessage: jest.fn().mockResolvedValue(null)
  };
});

beforeAll(async () => {
  jest.setTimeout(30000);
});

afterAll(async () => {
});

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

if (process.env.DEBUG !== 'true') {
  console.log = jest.fn();
  console.error = jest.fn();
}

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});