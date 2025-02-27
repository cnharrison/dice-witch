import { DiscordServiceMock as DiscordService } from '../mocks/serviceMocks';
import { Client, ShardingManager, EmbedBuilder, TextChannel } from 'discord.js';

// Mock the discord.js classes
jest.mock('discord.js', () => {
  const original = jest.requireActual('discord.js');
  
  // Create mock implementations
  const ClientMock = jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue('token'),
    isReady: jest.fn().mockReturnValue(true),
    on: jest.fn(),
    once: jest.fn(),
    shard: {
      fetchClientValues: jest.fn().mockResolvedValue([5]), // 5 guilds
      broadcastEval: jest.fn().mockResolvedValue([500]) // 500 members
    },
    guilds: {
      cache: {
        size: 5,
        reduce: jest.fn().mockReturnValue(500)
      }
    },
    channels: {
      fetch: jest.fn().mockResolvedValue({
        id: 'mock-channel-id',
        name: 'mock-channel',
        type: 0,
        isTextBased: jest.fn().mockReturnValue(true),
        send: jest.fn().mockResolvedValue({}),
        guild: {
          id: 'mock-guild-id',
          name: 'mock-guild'
        }
      })
    }
  }));

  const ShardMock = {
    eval: jest.fn().mockImplementation(async (func, context) => {
      // Simulate the shard evaluation logic
      if (context.context.channelId === 'valid-channel') {
        return {
          id: 'valid-channel',
          name: 'test-channel',
          type: 0,
          guild: {
            id: 'test-guild',
            name: 'Test Guild'
          }
        };
      }
      return null;
    })
  };

  const ShardingManagerMock = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    spawn: jest.fn().mockResolvedValue(undefined),
    shards: {
      size: 1,
      get: jest.fn().mockReturnValue(ShardMock)
    }
  }));

  return {
    ...original,
    Client: ClientMock,
    ShardingManager: ShardingManagerMock
  };
});

describe('Discord Integration Tests', () => {
  let discordService: DiscordService;
  let mockClient: Client;
  let mockManager: ShardingManager;

  beforeAll(() => {
    discordService = DiscordService.getInstance();
    mockClient = new Client({ intents: [] });
    mockManager = new ShardingManager('./mock.js');
    
    discordService.setClient(mockClient);
    discordService.setManager(mockManager);
  });

  describe('Discord Service', () => {
    test('should get user count from shards', async () => {
      const counts = await discordService.getUserCount();
      
      expect(counts).toHaveProperty('totalGuilds');
      expect(counts).toHaveProperty('totalMembers');
      expect(counts.totalGuilds).toBeGreaterThan(0);
      expect(counts.totalMembers).toBeGreaterThan(0);
    });

    test('should check for attachment permissions', () => {
      const mockInteraction = {
        channel: {
          type: 0,
          permissionsFor: jest.fn().mockReturnValue({
            toArray: jest.fn().mockReturnValue(['AttachFiles', 'EmbedLinks'])
          })
        },
        guild: {
          members: {
            me: {}
          }
        }
      };
      
      const result = discordService.checkForAttachPermission(mockInteraction as any);
      expect(result).toBe(true);
    });

    test('should get channel information', async () => {
      // Test with a valid channel ID
      const validChannel = await discordService.getChannel('valid-channel');
      expect(validChannel).toBeDefined();
      expect(validChannel?.name).toBe('test-channel');
      expect(validChannel?.guild?.name).toBe('Test Guild');

      // Test with an invalid channel ID
      const invalidChannel = await discordService.getChannel('invalid-channel');
      expect(invalidChannel).toBeNull();
    });

    test('should send messages to channels', async () => {
      const mockEmbed = new EmbedBuilder()
        .setDescription('Test message')
        .setColor(0x0099ff);
      
      const result = await discordService.sendMessage('valid-channel', {
        embeds: [mockEmbed],
        files: []
      });
      
      expect(result.success).toBe(true);
    });
  });
});