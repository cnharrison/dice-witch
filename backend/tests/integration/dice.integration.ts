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
      
      // Verify structure
      expect(result).toHaveProperty('diceArray');
      expect(result).toHaveProperty('resultArray');
      
      // Verify dice array
      expect(result.diceArray).toBeInstanceOf(Array);
      expect(result.diceArray.length).toBeGreaterThan(0);
      
      // Verify results
      expect(result.resultArray).toBeInstanceOf(Array);
      expect(result.resultArray.length).toBe(1);
      
      // Each result should have the expected format
      const firstResult = result.resultArray[0];
      expect(firstResult).toHaveProperty('output');
      expect(firstResult).toHaveProperty('results');
      
      // Validate the roll total is within expected range
      expect(firstResult.results).toBeGreaterThanOrEqual(2); // min for 2d6
      expect(firstResult.results).toBeLessThanOrEqual(12); // max for 2d6
    });

    test('should handle complex dice notation', async () => {
      const result = await diceService.rollDice(['2d20 + 5'], [4, 6, 8, 10, 12, 20, 100]);
      
      expect(result.resultArray[0].results).toBeGreaterThanOrEqual(7); // min: 1+1+5
      expect(result.resultArray[0].results).toBeLessThanOrEqual(45); // max: 20+20+5
    });

    test('should generate dice image', async () => {
      // First roll some dice to get a dice array
      const rollResult = await diceService.rollDice(['3d6'], [4, 6, 8, 10, 12, 20, 100]);
      
      // Now generate an image from those dice
      const attachmentResult = await diceService.generateDiceAttachment(rollResult.diceArray);
      
      // Verify we got an attachment back
      expect(attachmentResult).toBeDefined();
      expect(attachmentResult?.attachment).toBeDefined();
    });

    test('should handle invalid dice notation', async () => {
      const result = await diceService.rollDice(['invalid'], [4, 6, 8, 10, 12, 20, 100]);
      
      // Should return empty arrays but not crash
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
      
      // Verify structure
      expect(result).toHaveProperty('diceArray');
      expect(result).toHaveProperty('resultArray');
      expect(result).toHaveProperty('files');
      
      // Check results
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
      
      // Should have results for each notation
      expect(result.resultArray.length).toBe(3);
      expect(result.diceArray.length).toBe(3);
    });

    test('should check dice limits correctly', () => {
      // Valid dice within limits
      const result1 = rollService.checkDiceLimits('5d6');
      expect(result1.isOverMax).toBe(false);
      expect(result1.containsDice).toBe(true);
      
      // Too many dice (assuming maxImageDice is under 100)
      const result2 = rollService.checkDiceLimits('100d6');
      expect(result2.isOverMax).toBe(true);
      expect(result2.containsDice).toBe(true);
    });
    
    test('should detect invalid dice notation', () => {
      // Plain number without dice notation
      const result1 = rollService.checkDiceLimits('8000');
      expect(result1.containsDice).toBe(false);
      
      // Invalid text
      const result2 = rollService.checkDiceLimits('heyheyhey');
      expect(result2.containsDice).toBe(false);
      
      // Empty string
      const result3 = rollService.checkDiceLimits('');
      expect(result3.containsDice).toBe(false);
    });
  });
});