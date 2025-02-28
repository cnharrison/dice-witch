import { jest } from '@jest/globals';

export const CONFIG = {
  HOST: 'localhost',
  PORT: 3000,
  DISCORD_TOKEN: 'mock-token',
  DISCORD_CLIENT_ID: 'mock-client-id',
  DISCORD_LOG_CHANNEL_ID: 'mock-log-channel',
  DISCORD_ADMIN_ROLE: 'Dice Witch Admin',
  DATABASE_URL: 'mock-database-url',
  discord: {
    inviteLink: 'https://mock-invite.com',
    supportServerLink: 'https://mock-support.com'
  },
  botPath: '/home/mock/bot'
};

export const mockConfig = {
  inviteLink: 'https://mock-invite.com',
  supportServerLink: 'https://mock-support.com'
};

// Mock services as needed for dice tests
jest.mock('../core/services/DatabaseService', () => {
  return {
    DatabaseService: {
      getInstance: jest.fn().mockImplementation(() => ({
        updateOnCommand: jest.fn().mockResolvedValue(true),
        getGuildSettings: jest.fn().mockResolvedValue({ skipDiceDelay: true })
      }))
    }
  };
});

jest.mock('../core/services/DiscordService', () => {
  return {
    DiscordService: {
      getInstance: jest.fn().mockImplementation(() => ({
        sendMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' }),
        getChannel: jest.fn().mockResolvedValue({ name: 'mock-channel', guild: { name: 'mock-guild' } })
      }))
    }
  };
});

// Allow these modules to be used directly in tests
jest.mock('@napi-rs/canvas', () => {
  return {
    createCanvas: jest.fn().mockReturnValue({
      getContext: jest.fn().mockReturnValue({
        drawImage: jest.fn(),
        getImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray() })
      }),
      toBuffer: jest.fn().mockReturnValue(Buffer.from('mock-buffer'))
    }),
    loadImage: jest.fn().mockResolvedValue({})
  };
}, { virtual: true });

// Mock sharp
jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => ({
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-buffer'))
  }));
}, { virtual: true });