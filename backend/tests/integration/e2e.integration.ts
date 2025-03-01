import {
  DiceServiceMock as DiceService,
  RollServiceMock as RollService,
  DiscordServiceMock as DiscordService
} from '../mocks/serviceMocks';
import { Client, ShardingManager } from 'discord.js';

jest.mock('discord.js', () => {
  const original = jest.requireActual('discord.js');

  const ShardMock = {
    eval: jest.fn().mockImplementation(async (func, context) => {
      if (context.context.channelId === 'test-channel') {
        return {
          id: 'test-channel',
          name: 'test-channel',
          isTextBased: () => true,
          send: jest.fn().mockResolvedValue({}),
          guild: {
            id: 'test-guild',
            name: 'Test Guild'
          }
        };
      }
      return null;
    })
  };

  return {
    ...original,
    ShardingManager: jest.fn().mockImplementation(() => ({
      shards: {
        size: 1,
        get: jest.fn().mockReturnValue(ShardMock)
      }
    }))
  };
});

describe('End-to-End Integration Tests', () => {
  let diceService: DiceService;
  let rollService: RollService;
  let discordService: DiscordService;

  beforeAll(() => {
    diceService = DiceService.getInstance();
    rollService = RollService.getInstance();
    discordService = DiscordService.getInstance();

    discordService.setManager(new ShardingManager('./dummy.js'));
  });

  test('Complete dice roll flow', async () => {
    const diceNotation = '2d20+5';
    const result = await rollService.rollDice({
      notation: diceNotation,
      channelId: 'test-channel',
      username: 'web-user',
      source: 'web'
    });

    expect(result.notation).toBe(diceNotation);
    expect(result.resultArray[0].results).toBeGreaterThanOrEqual(2);
    expect(result.resultArray[0].results).toBeLessThanOrEqual(40);
  });

  test('Multiple character initiative roll', async () => {
    const characters = [
      { name: 'Rogue', modifier: 4 },
      { name: 'Fighter', modifier: 2 },
      { name: 'Wizard', modifier: -1 }
    ];

    const results = await Promise.all(characters.map(char =>
      rollService.rollDice({
        notation: `1d20${char.modifier >= 0 ? '+' + char.modifier : char.modifier}`,
        title: `${char.name}'s Initiative`,
        source: 'web',
        username: 'DM'
      })
    ));

    expect(results.length).toBe(characters.length);
    results.forEach(result => {
      expect(result.resultArray[0].results).toBeGreaterThanOrEqual(1);
      expect(result.resultArray[0].results).toBeLessThanOrEqual(20);
    });
  });
});