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

jest.mock('../core/services/DatabaseService', () => {
  const mockUpdateOnCommand = jest.fn().mockResolvedValue(true);
  mockUpdateOnCommand.mock = { calls: [] };
  
  const mockGetGuildSettings = jest.fn().mockResolvedValue({ skipDiceDelay: true });
  mockGetGuildSettings.mock = { calls: [] };
  
  const mockHandleWebLogin = jest.fn().mockResolvedValue(undefined);
  mockHandleWebLogin.mock = { calls: [] };
  
  const mockGetInstance = jest.fn().mockImplementation(() => ({
    updateOnCommand: mockUpdateOnCommand,
    getGuildSettings: mockGetGuildSettings,
    handleWebLogin: mockHandleWebLogin
  }));
  mockGetInstance.mock = { calls: [] };
  
  return {
    DatabaseService: {
      getInstance: mockGetInstance
    }
  };
});

jest.mock('../core/services/DiscordService', () => {
  const mockSendMessage = jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' });
  mockSendMessage.mock = { calls: [] };
  
  const mockGetChannel = jest.fn().mockResolvedValue({ name: 'mock-channel', guild: { name: 'mock-guild' } });
  mockGetChannel.mock = { calls: [] };
  
  const mockGetInstance = jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
    getChannel: mockGetChannel
  }));
  mockGetInstance.mock = { calls: [] };
  
  return {
    DiscordService: {
      getInstance: mockGetInstance
    }
  };
});

jest.mock('@napi-rs/canvas', () => {
  const mockToBuffer = jest.fn().mockReturnValue(Buffer.from('mock-buffer'));
  mockToBuffer.mock = { calls: [] };
  
  const mockDrawImage = jest.fn();
  mockDrawImage.mock = { calls: [] };
  
  const mockGetImageData = jest.fn().mockReturnValue({ data: new Uint8ClampedArray() });
  mockGetImageData.mock = { calls: [] };
  
  const mockGetContext = jest.fn().mockReturnValue({
    drawImage: mockDrawImage,
    getImageData: mockGetImageData
  });
  mockGetContext.mock = { calls: [] };
  
  const mockCreateCanvas = jest.fn().mockReturnValue({
    getContext: mockGetContext,
    toBuffer: mockToBuffer
  });
  mockCreateCanvas.mock = { calls: [] };
  
  const mockLoadImage = jest.fn().mockResolvedValue({});
  mockLoadImage.mock = { calls: [] };
  
  return {
    createCanvas: mockCreateCanvas,
    loadImage: mockLoadImage
  };
}, { virtual: true });

jest.mock('sharp', () => {
  const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('mock-buffer'));
  mockToBuffer.mock = { calls: [] };
  
  const mockWebp = jest.fn().mockImplementation(function() { return this; });
  mockWebp.mock = { calls: [] };
  
  const mockSharp = jest.fn().mockImplementation(() => ({
    webp: mockWebp,
    toBuffer: mockToBuffer
  }));
  mockSharp.mock = { calls: [] };
  
  return mockSharp;
}, { virtual: true });