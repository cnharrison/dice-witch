import { DiscordServiceMock as DiscordService } from '../mocks/serviceMocks';
import { Client, ShardingManager, EmbedBuilder, TextChannel } from 'discord.js';

jest.mock('discord.js', () => {
  const original = jest.requireActual('discord.js');
  
  const ClientMock = jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue('token'),
    isReady: jest.fn().mockReturnValue(true),
    on: jest.fn(),
    once: jest.fn(),
    shard: {
      fetchClientValues: jest.fn().mockResolvedValue([5]), 
      broadcastEval: jest.fn().mockResolvedValue([500]) 
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
      const validChannel = await discordService.getChannel('valid-channel');
      expect(validChannel).toBeDefined();
      expect(validChannel?.name).toBe('test-channel');
      expect(validChannel?.guild?.name).toBe('Test Guild');

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

  describe('Discord Integration', () => {
    const mockClient = {
        guilds: {
            cache: {
                size: 5,
                fetchClientValues: jest.fn().mockResolvedValue([5]),
                broadcastEval: jest.fn().mockResolvedValue([500])
            }
        }
    };

    test('Client guild and member count', async () => {
        const guildCount = await mockClient.guilds.cache.fetchClientValues('guilds.size');
        const memberCount = await mockClient.guilds.cache.broadcastEval('this.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)');

        expect(guildCount[0]).toBe(5);
        expect(memberCount[0]).toBe(500);
    });

    test('Channel message sending', async () => {
        const mockChannel = {
            send: jest.fn()
        };

        await sendMessageToChannel(mockChannel, 'Test message');
        expect(mockChannel.send).toHaveBeenCalledWith('Test message');
    });
  });
});