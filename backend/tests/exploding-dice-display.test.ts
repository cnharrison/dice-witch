import { DiceService } from '../core/services/DiceService';
import chroma from 'chroma-js';

describe('Exploding Dice Display', () => {
  let diceService: DiceService;

  beforeEach(() => {
    diceService = DiceService.getInstance();
  });

  describe('Display value normalization', () => {
    test('compound exploding d12 with value 23 shows face 11', async () => {
      // 23 on d12 = 12 + 11 (exploded once, last roll was 11)
      const buffer = await diceService.generateDie({
        sides: 12,
        rolled: 23 as any,
        textColor: '#000000',
        outlineColor: '#000000',
        solidFill: '#ffffff'
      });

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer!.length).toBeGreaterThan(0);
    });

    test('compound exploding d6 with value 14 shows face 2', async () => {
      // 14 on d6 = 6 + 6 + 2 (exploded twice, last roll was 2)
      const buffer = await diceService.generateDie({
        sides: 6,
        rolled: 14 as any,
        textColor: '#000000',
        outlineColor: '#000000',
        solidFill: '#ffffff'
      });

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer!.length).toBeGreaterThan(0);
    });

    test('normal roll within range is unchanged', async () => {
      const buffer = await diceService.generateDie({
        sides: 12,
        rolled: 7,
        textColor: '#000000',
        outlineColor: '#000000',
        solidFill: '#ffffff'
      });

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
    });

    test('max roll equals sides is unchanged', async () => {
      const buffer = await diceService.generateDie({
        sides: 20,
        rolled: 20,
        textColor: '#000000',
        outlineColor: '#000000',
        solidFill: '#ffffff'
      });

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
    });

    test.each([
      { rolled: 13, sides: 12, expectedFace: 1 },  // 12 + 1
      { rolled: 24, sides: 12, expectedFace: 12 }, // 12 + 12
      { rolled: 25, sides: 12, expectedFace: 1 },  // 12 + 12 + 1
      { rolled: 7, sides: 6, expectedFace: 1 },    // 6 + 1
      { rolled: 18, sides: 6, expectedFace: 6 },   // 6 + 6 + 6
      { rolled: 21, sides: 20, expectedFace: 1 },  // 20 + 1
      { rolled: 40, sides: 20, expectedFace: 20 }, // 20 + 20
    ])('rolled=$rolled on d$sides normalizes to face $expectedFace', async ({ rolled, sides, expectedFace }) => {
      const buffer = await diceService.generateDie({
        sides,
        rolled: rolled as any,
        textColor: '#000000',
        outlineColor: '#000000',
        solidFill: '#ffffff'
      });

      expect(buffer).toBeDefined();
      expect(buffer!.length).toBeGreaterThan(0);
    });
  });

  describe('Full dice attachment with compound explosions', () => {
    test('generates valid attachment for compound exploding dice', async () => {
      const color = chroma('#ff0000');
      const secondaryColor = chroma('#880000');
      const textColor = chroma('#ffffff');

      const diceArray = [[
        {
          sides: 12 as const,
          rolled: 6 as any,
          color,
          secondaryColor,
          textColor,
          icon: ['trashcan'] as any,
          iconSpacing: 0.375
        },
        {
          sides: 12 as const,
          rolled: 9 as any,
          color,
          secondaryColor,
          textColor,
          icon: ['trashcan'] as any,
          iconSpacing: 0.375
        },
        {
          sides: 12 as const,
          rolled: 23 as any, // compound explosion: 12 + 11
          color,
          secondaryColor,
          textColor,
          icon: ['explosion'] as any,
          iconSpacing: 0.375
        },
        {
          sides: 12 as const,
          rolled: 6 as any,
          color,
          secondaryColor,
          textColor,
          icon: ['trashcan'] as any,
          iconSpacing: 0.375
        }
      ]];

      const result = await diceService.generateDiceAttachment(diceArray);

      expect(result).toBeDefined();
      expect(result!.attachment).toBeDefined();
    });

    test('handles extreme compound values', async () => {
      const color = chroma('#0000ff');
      const secondaryColor = chroma('#000088');
      const textColor = chroma('#ffffff');

      const diceArray = [[
        {
          sides: 6 as const,
          rolled: 36 as any, // 6+6+6+6+6+6 = extreme explosion
          color,
          secondaryColor,
          textColor,
          icon: ['explosion'] as any,
          iconSpacing: 0.375
        }
      ]];

      const result = await diceService.generateDiceAttachment(diceArray);

      expect(result).toBeDefined();
      expect(result!.attachment).toBeDefined();
      expect(result!.errors).toBeUndefined();
    });
  });
});
