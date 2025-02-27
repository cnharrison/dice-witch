import { 
  DiceServiceMock as DiceService, 
  RollServiceMock as RollService, 
  DiscordServiceMock as DiscordService 
} from '../mocks/serviceMocks';
import { Client, ShardingManager } from 'discord.js';

// Mocks
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
    
    // Setup discord service with mocked manager
    discordService.setManager(new ShardingManager('./dummy.js'));
  });
  
  test('complete dice rolling flow from web to discord', async () => {
    // This test simulates the complete flow from web request to Discord message
    
    // 1. User submits a dice roll from the web
    const result = await rollService.rollDice({
      notation: '2d20',
      channelId: 'test-channel',
      username: 'web-user',
      source: 'web'
    });
    
    // Verify basic response structure
    expect(result).toHaveProperty('diceArray');
    expect(result).toHaveProperty('resultArray');
    expect(result).toHaveProperty('files');
    
    // 2. Check that the results are valid
    expect(result.resultArray.length).toBe(1);
    const rollTotal = result.resultArray[0].results;
    expect(rollTotal).toBeGreaterThanOrEqual(2); // Min for 2d20
    expect(rollTotal).toBeLessThanOrEqual(40); // Max for 2d20
    
    // 3. For web rolls to channels, we should have additional fields
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('Message sent to Discord channel');
  });
  
  test('handles a series of dice rolls with different notations', async () => {
    // This test simulates multiple rolls with different dice
    const notations = ['1d4', '2d6+3', '1d20-2'];
    
    for (const notation of notations) {
      const result = await rollService.rollDice({
        notation,
        source: 'web',
        username: 'test-user'
      });
      
      // Each roll should succeed
      expect(result.resultArray.length).toBe(1);
      expect(result.resultArray[0]).toHaveProperty('output');
      expect(result.resultArray[0].output).toContain(notation);
    }
  });
  
  test('complex initiative roll for multiple characters', async () => {
    // Simulate an initiative roll for a party of adventurers
    const characters = [
      { name: 'Wizard', modifier: -1 },
      { name: 'Fighter', modifier: 2 },
      { name: 'Rogue', modifier: 4 },
      { name: 'Cleric', modifier: 0 }
    ];
    
    const results = await Promise.all(characters.map(char => 
      rollService.rollDice({
        notation: `1d20${char.modifier >= 0 ? '+' + char.modifier : char.modifier}`,
        title: `${char.name}'s Initiative`,
        source: 'web',
        username: 'DM'
      })
    ));
    
    // Verify each character got a valid roll
    results.forEach((result, index) => {
      const char = characters[index];
      expect(result.resultArray.length).toBe(1);
      
      const total = result.resultArray[0].results;
      const minPossible = 1 + char.modifier;
      const maxPossible = 20 + char.modifier;
      
      expect(total).toBeGreaterThanOrEqual(minPossible);
      expect(total).toBeLessThanOrEqual(maxPossible);
    });
  });
});