import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockDiceServiceRollDice = jest.fn();
const mockGenerateDiceAttachment = jest.fn();
const mockGenerateDiceRolledMessage = jest.fn().mockReturnValue('...');
const mockGenerateEmbedMessage = jest.fn().mockResolvedValue({ embeds: [], files: [] });

jest.mock('../../core/services/DiceService', () => ({
  DiceService: {
    getInstance: () => ({
      rollDice: (...args: any[]) => mockDiceServiceRollDice(...args),
      generateDiceAttachment: (...args: any[]) => mockGenerateDiceAttachment(...args),
      generateDiceRolledMessage: (...args: any[]) => mockGenerateDiceRolledMessage(...args),
      generateEmbedMessage: (...args: any[]) => mockGenerateEmbedMessage(...args),
    }),
  },
}));

jest.mock('../../core/services/DiscordService', () => ({
  DiscordService: {
    getInstance: () => ({
      getChannel: jest.fn().mockResolvedValue(null),
      sendMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
      checkForAttachPermission: jest.fn().mockReturnValue(true),
    }),
  },
}));

import { RollService } from '../../core/services/RollService';

const singleDie = { sides: 6, rolled: 3, value: 3 };
const makeGroup = (n: number) => Array(n).fill(singleDie);

// ─── checkDiceLimits ─────────────────────────────────────────────────────────

describe('RollService.checkDiceLimits — real implementation', () => {
  let service: RollService;

  beforeEach(() => {
    service = RollService.getInstance();
  });

  // Base dice count
  test('allows notation within limit', () => {
    expect(service.checkDiceLimits('10d6', 1)).toMatchObject({ isOverMax: false, containsDice: true });
  });

  test('allows notation exactly at limit (50 dice)', () => {
    expect(service.checkDiceLimits('50d6', 1)).toMatchObject({ isOverMax: false, containsDice: true });
  });

  test('blocks notation over 50 dice', () => {
    expect(service.checkDiceLimits('51d6', 1)).toMatchObject({ isOverMax: true, containsDice: true });
  });

  test('blocks notation with sides over 999', () => {
    expect(service.checkDiceLimits('1d1000', 1)).toMatchObject({ isOverMax: true, containsDice: true });
  });

  test('returns containsDice:false for non-dice input', () => {
    expect(service.checkDiceLimits('heyheyhey', 1)).toMatchObject({ isOverMax: false, containsDice: false });
  });

  test('returns containsDice:false for empty string', () => {
    expect(service.checkDiceLimits('', 1)).toMatchObject({ isOverMax: false, containsDice: false });
  });

  // timesToRepeat multiplier
  test('blocks when timesToRepeat pushes total dice over limit', () => {
    // 10d6 * 6 = 60 dice — over limit
    expect(service.checkDiceLimits('10d6', 6)).toMatchObject({ isOverMax: true, containsDice: true });
  });

  test('allows when timesToRepeat keeps total at limit', () => {
    // 10d6 * 5 = 50 dice — exactly at limit
    expect(service.checkDiceLimits('10d6', 5)).toMatchObject({ isOverMax: false, containsDice: true });
  });

  test('blocks multi-term notation where combined total exceeds limit', () => {
    // 30d6 + 30d6 = 60 dice
    expect(service.checkDiceLimits('30d6+30d6', 1)).toMatchObject({ isOverMax: true, containsDice: true });
  });

  test('applies timesToRepeat across multiple notation terms', () => {
    // ['10d6', '10d6'] = 20 dice × 3 = 60
    expect(service.checkDiceLimits(['10d6', '10d6'], 3)).toMatchObject({ isOverMax: true, containsDice: true });
  });

  // Explosive dice safety
  test('blocks always-true explode condition (!>0)', () => {
    const result = service.checkDiceLimits('d100!>0', 1);
    expect(result.isOverMax).toBe(true);
    expect(result.unsafeNotationReason).toMatch(/exploded dice count/i);
  });

  test('blocks high-probability explode that exceeds expected limit (10d100!>1)', () => {
    const result = service.checkDiceLimits('10d100!>1', 1);
    expect(result.isOverMax).toBe(true);
    expect(result.unsafeNotationReason).toMatch(/exploded dice count/i);
  });

  test('allows standard explode on max face (1d6!)', () => {
    // 1d6! — explodes on 6, expected ~1.2 dice — well under limit
    const result = service.checkDiceLimits('1d6!', 1);
    expect(result.isOverMax).toBe(false);
    expect(result.unsafeNotationReason).toBeUndefined();
  });

  test('allows compound explode even with high probability (!!=6 style)', () => {
    // Compound explosions always render as quantity dice regardless of explosion count
    const result = service.checkDiceLimits('10d10!!>1', 1);
    expect(result.isOverMax).toBe(false);
    expect(result.unsafeNotationReason).toBeUndefined();
  });

  test('invalid notation chunk falls through without over-max false positive', () => {
    // Parser will fail on "notdice" — should return containsDice:true, isOverMax:false
    // so the roll engine can produce the proper invalid-notation error
    expect(service.checkDiceLimits(['1d6', 'notdice'], 1)).toMatchObject({
      isOverMax: false,
      containsDice: true,
    });
  });

  // Grouped / complex notation (exercises collectDiceNodes AST traversal)
  test('correctly counts dice in grouped notation', () => {
    // {4d6k2} keeps 2 of 4d6 — but all 4 dice are rolled/rendered
    expect(service.checkDiceLimits('{4d6k2}', 1)).toMatchObject({ isOverMax: false, containsDice: true });
  });

  test('correctly sums dice across grouped terms', () => {
    // {30d6}+{25d6} = 55 dice — over limit
    expect(service.checkDiceLimits('{30d6}+{25d6}', 1)).toMatchObject({ isOverMax: true, containsDice: true });
  });

  test('handles grouped notation with exploding dice', () => {
    // {3d10!>8} — explode on 9-10 (20% probability), expected ~3.75 dice — under limit
    expect(service.checkDiceLimits('{3d10!>8}', 1)).toMatchObject({ isOverMax: false, containsDice: true });
  });

  test('handles mixed grouped and plain notation', () => {
    // {4d6k2}+2d20 — 6 dice total, under limit
    expect(service.checkDiceLimits('{4d6k2}+2d20', 1)).toMatchObject({ isOverMax: false, containsDice: true });
  });
});

describe('RollService.rollDice — post-roll DICE_OVER_MAX enforcement', () => {
  let service: RollService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = RollService.getInstance();
  });

  test('returns DICE_OVER_MAX when rendered dice exceed 50', async () => {
    mockDiceServiceRollDice.mockResolvedValue({
      diceArray: [makeGroup(51)],
      resultArray: [{ output: '51d6: 153', results: 153 }],
      errors: undefined,
      files: [],
    });

    const result = await service.rollDice({ notation: '51d6', source: 'discord' });

    expect(result.errors).toContain('DICE_OVER_MAX');
    expect(result.diceArray).toHaveLength(0);
    expect(result.resultArray).toHaveLength(0);
    expect(result.message).toMatch(/50 dice max/);
  });

  test('returns DICE_OVER_MAX for multi-roll totalling over 50', async () => {
    mockDiceServiceRollDice.mockResolvedValue({
      diceArray: [makeGroup(30), makeGroup(25)],
      resultArray: [
        { output: '30d6: 90', results: 90 },
        { output: '25d6: 75', results: 75 },
      ],
      errors: undefined,
      files: [],
    });

    const result = await service.rollDice({ notation: ['30d6', '25d6'], source: 'discord' });

    expect(result.errors).toContain('DICE_OVER_MAX');
  });

  test('does not return DICE_OVER_MAX when rendered dice are exactly 50', async () => {
    mockDiceServiceRollDice.mockResolvedValue({
      diceArray: [makeGroup(50)],
      resultArray: [{ output: '50d6: 150', results: 150 }],
      errors: undefined,
      files: [],
    });

    const result = await service.rollDice({ notation: '50d6', source: 'discord' });

    expect(result.errors).toBeUndefined();
    expect(result.diceArray).toHaveLength(1);
  });

  test('does not return DICE_OVER_MAX when rendered dice are below 50', async () => {
    mockDiceServiceRollDice.mockResolvedValue({
      diceArray: [makeGroup(5)],
      resultArray: [{ output: '5d6: 18', results: 18 }],
      errors: undefined,
      files: [],
    });

    const result = await service.rollDice({ notation: '5d6', source: 'discord' });

    expect(result.errors).toBeUndefined();
    expect(result.diceArray).toHaveLength(1);
  });

  test('passes existing roll errors through when under limit', async () => {
    mockDiceServiceRollDice.mockResolvedValue({
      diceArray: [makeGroup(3)],
      resultArray: [{ output: '3d6: 9', results: 9 }],
      errors: ['some-non-fatal-error'],
      files: [],
    });

    const result = await service.rollDice({ notation: '3d6', source: 'discord' });

    expect(result.errors).toEqual(['some-non-fatal-error']);
    expect(result.errors).not.toContain('DICE_OVER_MAX');
  });
});
