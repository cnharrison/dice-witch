import {
  DiceServiceMock as DiceService,
  RollServiceMock as RollService
} from '../mocks/serviceMocks';

describe('Platform-Specific Integration Tests', () => {
  let diceService: DiceService;
  let rollService: RollService;

  beforeAll(() => {
    diceService = DiceService.getInstance();
    rollService = RollService.getInstance();
  });

  describe('Web vs Discord Rolling', () => {
    test('should handle web rolls correctly with dice rolling message and replies', async () => {
      const mockGenerateMessage = jest.fn().mockReturnValue('_...the dice clatter across the table..._');
      diceService.generateDiceRolledMessage = mockGenerateMessage;

      const result = await rollService.rollDice({
        notation: '2d20',
        source: 'web',
        username: 'web-user',
        channelId: 'test-channel'
      });

      expect(result).toHaveProperty('base64Image');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('channelName');
      expect(result).toHaveProperty('guildName');

      expect(result.message).toContain('Message sent to Discord channel');
    });

    test('should handle Discord rolls correctly', async () => {
      const mockInteraction = {
        user: { username: 'discord-user' },
        guild: { id: 'test-guild', name: 'Test Guild' }
      };

      const result = await rollService.rollDice({
        notation: '2d20',
        source: 'discord',
        interaction: mockInteraction
      });

      expect(result.files).toBeDefined();
      expect(result.base64Image).toBeUndefined();
      expect(result.message).toBeUndefined();
    });
  });

  describe('Non-standard Dice', () => {
    test('should handle non-standard dice sides (5d9)', async () => {
      const result = await diceService.rollDice(['5d9'], [4, 6, 8, 10, 12, 20, 100]);

      expect(result.files).toBeDefined();
      expect(result.resultArray[0].results).toBe(15);
    });

    test('should handle mixed dice with standard and non-standard sides (5d9+3d6)', async () => {
      const result = await diceService.rollDice(['5d9+3d6'], [4, 6, 8, 10, 12, 20, 100]);

      expect(result.files).toBeDefined();
      expect(result.resultArray[0].results).toBe(15);
    });
  });

  describe('Complex Dice Combinations', () => {
    test('rolling multiple different dice types', async () => {
      const result = await rollService.rollDice({
        notation: ['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100'],
        source: 'web',
        username: 'test-user'
      });

      expect(result.diceArray.length).toBe(7);
      expect(result.resultArray.length).toBe(7);
      expect(result.files).toBeDefined();
    });

    test('rolling with unsupported dice notation', async () => {
      const result = await rollService.rollDice({
        notation: 'xyz',
        source: 'discord'
      });

      expect(result.resultArray).toBeDefined();
    });
  });

});