import { describe, test, expect } from '@jest/globals';
import DiceService from '../../core/services/DiceService';

/**
 * Tests for DiceService.rollDice.
 *
 * Since the internal generateDiceAttachment call was removed from this method,
 * it no longer generates image attachments — that responsibility belongs entirely
 * to callers (RollService for Discord, web routes for web). The `files` field in
 * the return value is therefore always an empty array.
 */

describe('DiceService.rollDice — files is always empty', () => {
  const service = DiceService.getInstance();

  test('returns empty files array for a simple roll', async () => {
    const result = await service.rollDice(['1d6'], [4, 6, 8, 10, 12, 20, 100]);
    expect(result.files).toEqual([]);
  });

  test('returns empty files array for a multi-die roll', async () => {
    const result = await service.rollDice(['4d6k3'], [4, 6, 8, 10, 12, 20, 100]);
    expect(result.files).toEqual([]);
  });

  test('returns empty files array for a multi-notation roll', async () => {
    const result = await service.rollDice(['1d20+5', '2d6'], [4, 6, 8, 10, 12, 20, 100]);
    expect(result.files).toEqual([]);
  });

  test('still returns diceArray and resultArray alongside empty files', async () => {
    const result = await service.rollDice(['2d6'], [4, 6, 8, 10, 12, 20, 100]);
    expect(result.files).toEqual([]);
    expect(result.diceArray.length).toBeGreaterThan(0);
    expect(result.resultArray.length).toBeGreaterThan(0);
  });
});
