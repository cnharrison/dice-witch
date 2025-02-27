import { DiceServiceMock as DiceService, RollServiceMock as RollService } from '../mocks/serviceMocks';
import { DiceArray, Result } from '../../shared/types';

describe('Dice Integration Tests', () => {
  let diceService: DiceService;
  let rollService: RollService;

  beforeAll(() => {
    diceService = DiceService.getInstance();
    rollService = RollService.getInstance();
  });

  describe('DiceService', () => {
    test('should roll dice with valid notation', async () => {
      const result = await diceService.rollDice(['2d6'], [4, 6, 8, 10, 12, 20, 100]);

      expect(result).toHaveProperty('diceArray');
      expect(result).toHaveProperty('resultArray');

      expect(result.diceArray).toBeInstanceOf(Array);
      expect(result.diceArray.length).toBeGreaterThan(0);

      expect(result.resultArray).toBeInstanceOf(Array);
      expect(result.resultArray.length).toBe(1);

      const firstResult = result.resultArray[0];
      expect(firstResult).toHaveProperty('output');
      expect(firstResult).toHaveProperty('results');

      expect(firstResult.results).toBeGreaterThanOrEqual(2);
      expect(firstResult.results).toBeLessThanOrEqual(12);
    });

    test('should handle complex dice notation', async () => {
      const result = await diceService.rollDice(['2d20 + 5'], [4, 6, 8, 10, 12, 20, 100]);

      expect(result.resultArray[0].results).toBeGreaterThanOrEqual(7);
      expect(result.resultArray[0].results).toBeLessThanOrEqual(45);
    });

    test('should generate dice image', async () => {
      const rollResult = await diceService.rollDice(['3d6'], [4, 6, 8, 10, 12, 20, 100]);

      const attachmentResult = await diceService.generateDiceAttachment(rollResult.diceArray);

      expect(attachmentResult).toBeDefined();
      expect(attachmentResult?.attachment).toBeDefined();
    });

    test('should handle invalid dice notation', async () => {
      const result = await diceService.rollDice(['invalid'], [4, 6, 8, 10, 12, 20, 100]);

      expect(result.diceArray).toEqual([]);
      expect(result.resultArray).toEqual([]);
      expect(result.errors).toBeDefined();
    });
  });

  describe('RollService', () => {
    test('should roll dice through the service', async () => {
      const result = await rollService.rollDice({
        notation: '1d20',
        source: 'web',
        username: 'test-user'
      });

      expect(result).toHaveProperty('diceArray');
      expect(result).toHaveProperty('resultArray');
      expect(result).toHaveProperty('files');

      expect(result.resultArray.length).toBe(1);
      const rollTotal = result.resultArray[0].results;
      expect(rollTotal).toBeGreaterThanOrEqual(1);
      expect(rollTotal).toBeLessThanOrEqual(20);
    });

    test('should handle multiple dice notations', async () => {
      const result = await rollService.rollDice({
        notation: ['1d4', '1d6', '1d8'],
        source: 'web',
        username: 'test-user'
      });

      expect(result.resultArray.length).toBe(3);
      expect(result.diceArray.length).toBe(3);
    });

    test('should check dice limits correctly', () => {
      const result1 = rollService.checkDiceLimits('5d6');
      expect(result1.isOverMax).toBe(false);
      expect(result1.containsDice).toBe(true);

      const result2 = rollService.checkDiceLimits('100d6');
      expect(result2.isOverMax).toBe(true);
      expect(result2.containsDice).toBe(true);
    });

    test('should detect invalid dice notation', () => {
      const result1 = rollService.checkDiceLimits('8000');
      expect(result1.containsDice).toBe(false);

      const result2 = rollService.checkDiceLimits('heyheyhey');
      expect(result2.containsDice).toBe(false);

      const result3 = rollService.checkDiceLimits('');
      expect(result3.containsDice).toBe(false);
    });
  });

  describe('Dice Integration', () => {
    test('Basic dice roll validation', async () => {
      const result = await rollService.rollDice({
        notation: '2d6',
        source: 'web',
        username: 'test-user'
      });

      expect(result.resultArray[0].results).toBeGreaterThanOrEqual(2);
      expect(result.resultArray[0].results).toBeLessThanOrEqual(12);
    });

    test('Dice roll with modifier', async () => {
      const result = await rollService.rollDice({
        notation: '1d20+5',
        source: 'web',
        username: 'test-user'
      });

      expect(result.resultArray[0].results).toBeGreaterThanOrEqual(7);
      expect(result.resultArray[0].results).toBeLessThanOrEqual(45);
    });

    test('Multiple dice roll scenarios', async () => {
      const scenarios = [
        { notation: '2d6', expectedMin: 2, expectedMax: 12 },
        { notation: '1d20+5', expectedMin: 7, expectedMax: 45 },
        { notation: '3d6', expectedMin: 3, expectedMax: 18 }
      ];

      for (const scenario of scenarios) {
        const result = await rollService.rollDice({
          notation: scenario.notation,
          source: 'web',
          username: 'test-user'
        });

        expect(result.resultArray[0].results).toBeGreaterThanOrEqual(scenario.expectedMin);
        expect(result.resultArray[0].results).toBeLessThanOrEqual(scenario.expectedMax);
      }
    });

    test('Invalid dice roll inputs', async () => {
      const invalidInputs = [
        '100d20',
        'invalid text',
        ''
      ];

      for (const input of invalidInputs) {
        const result = await rollService.rollDice({
          notation: input,
          source: 'web',
          username: 'test-user'
        });
        expect(result.resultArray).toHaveLength(0);
      }
    });
  });
});