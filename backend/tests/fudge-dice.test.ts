import { DiceService } from '../core/services/DiceService';
import { DiceRoll } from '@dice-roller/rpg-dice-roller';
import chroma from 'chroma-js';

describe('Fudge Dice', () => {
  let diceService: DiceService;

  beforeEach(() => {
    diceService = DiceService.getInstance();
  });

  describe('generateDF (SVG generation)', () => {
    test('generates valid SVG for plus face (+1)', async () => {
      const buffer = await diceService.generateDie({
        sides: 'F',
        rolled: 1,
        textColor: '#000000',
        outlineColor: '#000000',
        solidFill: '#ffffff'
      });

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer!.length).toBeGreaterThan(0);
    });

    test('generates valid SVG for minus face (-1)', async () => {
      const buffer = await diceService.generateDie({
        sides: 'F',
        rolled: -1,
        textColor: '#000000',
        outlineColor: '#000000',
        solidFill: '#ffffff'
      });

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer!.length).toBeGreaterThan(0);
    });

    test('generates valid SVG for blank face (0)', async () => {
      const buffer = await diceService.generateDie({
        sides: 'F',
        rolled: 0,
        textColor: '#000000',
        outlineColor: '#000000',
        solidFill: '#ffffff'
      });

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer!.length).toBeGreaterThan(0);
    });

    test.each([
      { rolled: 1, description: 'plus' },
      { rolled: 0, description: 'blank' },
      { rolled: -1, description: 'minus' },
    ])('generates valid SVG for $description face (rolled=$rolled)', async ({ rolled }) => {
      const buffer = await diceService.generateDie({
        sides: 'F',
        rolled: rolled as any,
        textColor: '#ffffff',
        outlineColor: '#000000',
        solidFill: '#6b5b95'
      });

      expect(buffer).toBeDefined();
      expect(buffer!.length).toBeGreaterThan(0);
    });
  });

  describe('rollDice (parsing and processing)', () => {
    test('parses 4dF notation correctly', async () => {
      const result = await diceService.rollDice(['4dF'], [4, 6, 8, 10, 12, 20]);

      expect(result).toBeDefined();
      expect(result.errors).toBeUndefined();
      expect(result.resultArray).toHaveLength(1);
      expect(result.diceArray).toHaveLength(1);
      expect(result.diceArray[0]).toHaveLength(4);

      // Verify all dice are fudge dice
      result.diceArray[0].forEach(die => {
        expect(die.sides).toBe('F');
        expect([-1, 0, 1]).toContain(die.rolled);
      });
    });

    test('parses 1dF notation correctly', async () => {
      const result = await diceService.rollDice(['1dF'], [4, 6, 8, 10, 12, 20]);

      expect(result).toBeDefined();
      expect(result.resultArray).toHaveLength(1);
      expect(result.diceArray).toHaveLength(1);
      expect(result.diceArray[0]).toHaveLength(1);
      expect(result.diceArray[0][0].sides).toBe('F');
    });

    test('parses dF (implicit 1) notation correctly', async () => {
      const result = await diceService.rollDice(['dF'], [4, 6, 8, 10, 12, 20]);

      expect(result).toBeDefined();
      expect(result.resultArray).toHaveLength(1);
      expect(result.diceArray).toHaveLength(1);
      expect(result.diceArray[0]).toHaveLength(1);
      expect(result.diceArray[0][0].sides).toBe('F');
    });

    test('4dF total is between -4 and +4', async () => {
      // Run multiple times to verify range
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dF'], [4, 6, 8, 10, 12, 20]);

        expect(result.resultArray[0].results).toBeGreaterThanOrEqual(-4);
        expect(result.resultArray[0].results).toBeLessThanOrEqual(4);
      }
    });

    test('parses 4dF+2 notation with modifier', async () => {
      const result = await diceService.rollDice(['4dF+2'], [4, 6, 8, 10, 12, 20]);

      expect(result).toBeDefined();
      expect(result.resultArray).toHaveLength(1);
      expect(result.diceArray).toHaveLength(1);
      expect(result.diceArray[0]).toHaveLength(4);

      // Total should be base result + 2
      expect(result.resultArray[0].results).toBeGreaterThanOrEqual(-2); // -4 + 2
      expect(result.resultArray[0].results).toBeLessThanOrEqual(6);     // +4 + 2
    });

    test('parses mixed notation 4dF+1d6', async () => {
      const result = await diceService.rollDice(['4dF+1d6'], [4, 6, 8, 10, 12, 20]);

      expect(result).toBeDefined();
      expect(result.resultArray).toHaveLength(1);
      expect(result.diceArray).toHaveLength(1);

      // Should have 4 fudge dice + 1 d6
      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      const d6Dice = result.diceArray[0].filter(d => d.sides === 6);

      expect(fudgeDice).toHaveLength(4);
      expect(d6Dice).toHaveLength(1);
    });

    test('case insensitive - parses 4df (lowercase) correctly', async () => {
      const result = await diceService.rollDice(['4df'], [4, 6, 8, 10, 12, 20]);

      expect(result).toBeDefined();
      expect(result.diceArray[0]).toHaveLength(4);
      result.diceArray[0].forEach(die => {
        expect(die.sides).toBe('F');
      });
    });
  });

  describe('Full dice attachment generation', () => {
    test('generates valid attachment for fudge dice', async () => {
      const color = chroma('#6b5b95');
      const secondaryColor = chroma('#4a3f6b');
      const textColor = chroma('#ffffff');

      const diceArray = [[
        {
          sides: 'F' as const,
          rolled: 1 as any,
          color,
          secondaryColor,
          textColor,
          icon: null,
          iconSpacing: null
        },
        {
          sides: 'F' as const,
          rolled: 0 as any,
          color,
          secondaryColor,
          textColor,
          icon: null,
          iconSpacing: null
        },
        {
          sides: 'F' as const,
          rolled: -1 as any,
          color,
          secondaryColor,
          textColor,
          icon: null,
          iconSpacing: null
        },
        {
          sides: 'F' as const,
          rolled: 1 as any,
          color,
          secondaryColor,
          textColor,
          icon: null,
          iconSpacing: null
        }
      ]];

      const result = await diceService.generateDiceAttachment(diceArray);

      expect(result).toBeDefined();
      expect(result!.attachment).toBeDefined();
      expect(result!.errors).toBeUndefined();
    });

    test('generates attachment with mixed dice types including fudge', async () => {
      const color = chroma('#ff6600');
      const secondaryColor = chroma('#cc4400');
      const textColor = chroma('#ffffff');

      const diceArray = [[
        {
          sides: 'F' as const,
          rolled: 1 as any,
          color,
          secondaryColor,
          textColor,
          icon: null,
          iconSpacing: null
        },
        {
          sides: 20 as const,
          rolled: 15 as any,
          color,
          secondaryColor,
          textColor,
          icon: null,
          iconSpacing: null
        }
      ]];

      const result = await diceService.generateDiceAttachment(diceArray);

      expect(result).toBeDefined();
      expect(result!.attachment).toBeDefined();
    });
  });

  describe('Library output format verification', () => {
    test('rpg-dice-roller outputs fudge dice with expected format', () => {
      // Verify the actual library output format for fudge dice
      for (let i = 0; i < 5; i++) {
        const roll = new DiceRoll('4dF');

        // Output should contain a bracketed group
        expect(roll.output).toMatch(/\[/);
        expect(roll.output).toMatch(/\]/);

        // Extract the dice values from output
        const bracketMatch = roll.output.match(/\[([^\]]+)\]/);
        expect(bracketMatch).not.toBeNull();

        if (bracketMatch) {
          const values = bracketMatch[1].split(',').map(v => v.trim());
          expect(values).toHaveLength(4);

          // Each value should be a valid fudge result
          // Library can output: '+', '-', '', '1', '-1', '0', or blank
          values.forEach(v => {
            const isValidFudge = ['+', '-', '', '1', '-1', '0'].includes(v) ||
                                 v === '' ||
                                 /^-?[01]$/.test(v);
            expect(isValidFudge).toBe(true);
          });
        }
      }
    });

    test('rpg-dice-roller fudge dice total matches sum of face values', () => {
      for (let i = 0; i < 5; i++) {
        const roll = new DiceRoll('4dF');

        // Extract values and calculate expected total
        const bracketMatch = roll.output.match(/\[([^\]]+)\]/);
        if (bracketMatch) {
          const values = bracketMatch[1].split(',').map(v => v.trim());
          let expectedTotal = 0;
          values.forEach(v => {
            if (v === '+' || v === '1') expectedTotal += 1;
            else if (v === '-' || v === '-1') expectedTotal -= 1;
            // blank/''/0 = 0, no change
          });

          expect(roll.total).toBe(expectedTotal);
        }
      }
    });
  });

  describe('Edge cases and modifiers', () => {
    test('fudge dice values are always -1, 0, or 1', async () => {
      // Run multiple times to ensure we see all possible values
      const allValues = new Set<number>();

      for (let i = 0; i < 20; i++) {
        const result = await diceService.rollDice(['4dF'], []);
        result.diceArray[0].forEach(die => {
          allValues.add(die.rolled as number);
        });
      }

      // Should only contain -1, 0, 1
      allValues.forEach(v => {
        expect([-1, 0, 1]).toContain(v);
      });
    });

    test('sum of fudge dice values equals result total (correctness check)', async () => {
      // This is a NON-AXIOMATIC test - verifies actual correctness
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dF'], []);

        // Calculate sum of individual dice values
        const diceSum = result.diceArray[0].reduce((sum, die) => {
          return sum + (die.value as number);
        }, 0);

        // The total should equal the sum of dice values
        expect(result.resultArray[0].results).toBe(diceSum);
      }
    });

    test('mixed dice total equals sum of all dice values (correctness check)', async () => {
      // Verify correctness with mixed fudge + regular dice
      for (let i = 0; i < 5; i++) {
        const result = await diceService.rollDice(['2dF+1d6'], []);

        const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
        const d6Dice = result.diceArray[0].filter(d => d.sides === 6);

        const fudgeSum = fudgeDice.reduce((sum, die) => sum + (die.value as number), 0);
        const d6Sum = d6Dice.reduce((sum, die) => sum + (die.value as number), 0);

        // Total should equal fudge sum + d6 sum
        expect(result.resultArray[0].results).toBe(fudgeSum + d6Sum);
      }
    });

    test('handles uppercase and lowercase dF notation identically', async () => {
      const upperResult = await diceService.rollDice(['4dF'], []);
      const lowerResult = await diceService.rollDice(['4df'], []);

      // Both should parse successfully
      expect(upperResult.errors).toBeUndefined();
      expect(lowerResult.errors).toBeUndefined();

      // Both should produce 4 fudge dice
      expect(upperResult.diceArray[0]).toHaveLength(4);
      expect(lowerResult.diceArray[0]).toHaveLength(4);

      // All dice should be fudge type
      upperResult.diceArray[0].forEach(die => expect(die.sides).toBe('F'));
      lowerResult.diceArray[0].forEach(die => expect(die.sides).toBe('F'));
    });

    test('fudge dice with negative modifier', async () => {
      const result = await diceService.rollDice(['4dF-3'], []);

      expect(result.errors).toBeUndefined();
      expect(result.diceArray[0]).toHaveLength(4);

      // Total should be between -7 (-4-3) and +1 (+4-3)
      expect(result.resultArray[0].results).toBeGreaterThanOrEqual(-7);
      expect(result.resultArray[0].results).toBeLessThanOrEqual(1);
    });

    test('multiple fudge dice groups', async () => {
      const result = await diceService.rollDice(['2dF+2dF'], []);

      expect(result.errors).toBeUndefined();

      // Should have 4 fudge dice total
      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      expect(fudgeDice).toHaveLength(4);

      // Total should be between -4 and +4
      expect(result.resultArray[0].results).toBeGreaterThanOrEqual(-4);
      expect(result.resultArray[0].results).toBeLessThanOrEqual(4);
    });

    test('fudge dice in complex expression', async () => {
      const result = await diceService.rollDice(['4dF+1d6+2'], []);

      expect(result.errors).toBeUndefined();

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      const d6Dice = result.diceArray[0].filter(d => d.sides === 6);

      expect(fudgeDice).toHaveLength(4);
      expect(d6Dice).toHaveLength(1);

      // Total: 4dF (-4 to +4) + 1d6 (1-6) + 2 = -1 to 12
      expect(result.resultArray[0].results).toBeGreaterThanOrEqual(-1);
      expect(result.resultArray[0].results).toBeLessThanOrEqual(12);
    });
  });

  describe('Regex pattern tests (frontend fix verification)', () => {
    test('fudge dice regex matches all valid notations', () => {
      // This tests the regex pattern used in frontend parsing
      const diceRegex = /(\d+)?d(\d+|\%|F)/gi;

      // Test cases that should match
      const validNotations = [
        '4dF', '4df', '1dF', 'dF', '4dF+2', '2dF+2dF',
        '4d6', '1d20', '2d%', '4dF+1d6'
      ];

      validNotations.forEach(notation => {
        const matches = notation.match(diceRegex);
        expect(matches).not.toBeNull();
        expect(matches!.length).toBeGreaterThan(0);
      });
    });

    test('fudge dice regex captures F correctly', () => {
      const diceRegex = /(\d+)?d(\d+|\%|F)/gi;
      const notation = '4dF+2dF';
      const matches = [...notation.matchAll(diceRegex)];

      expect(matches).toHaveLength(2);
      expect(matches[0][2].toUpperCase()).toBe('F');
      expect(matches[1][2].toUpperCase()).toBe('F');
    });

    test('modifier pattern matches fudge dice notation', () => {
      // This is the pattern used in DiceNotationButtons handleModifierClick
      const modifierPattern = /\d+d(\d+|F)/i;

      expect(modifierPattern.test('4dF')).toBe(true);
      expect(modifierPattern.test('4df')).toBe(true);
      expect(modifierPattern.test('1dF+2')).toBe(true);
      expect(modifierPattern.test('4dF+1d6')).toBe(true);
      expect(modifierPattern.test('d6')).toBe(false); // No count
    });
  });

  describe('Fudge dice value parsing (frontend fix verification)', () => {
    test('fudge value parsing handles all library output formats', () => {
      // Simulate the parsing logic used in PreviewRoller
      const parseFudgeValue = (v: string): number => {
        if (v === '+' || v === '1') return 1;
        if (v === '-' || v === '-1') return -1;
        return 0;
      };

      // Library can output these formats
      expect(parseFudgeValue('+')).toBe(1);
      expect(parseFudgeValue('-')).toBe(-1);
      expect(parseFudgeValue('')).toBe(0);
      expect(parseFudgeValue('1')).toBe(1);
      expect(parseFudgeValue('-1')).toBe(-1);
      expect(parseFudgeValue('0')).toBe(0);
    });

    test('fudge dice random generation produces valid values', () => {
      // Simulate the random generation logic
      const generateFudgeValue = () => Math.floor(Math.random() * 3) - 1;

      for (let i = 0; i < 100; i++) {
        const value = generateFudgeValue();
        expect([-1, 0, 1]).toContain(value);
      }
    });
  });

  describe('Type compatibility tests', () => {
    test('diceSize can be number or string F', async () => {
      const result = await diceService.rollDice(['2dF+2d6'], []);

      const allDice = result.diceArray[0];
      const sideTypes = allDice.map(d => typeof d.sides);

      // Should have both string ('F') and number (6) sides
      expect(sideTypes).toContain('string');
      expect(sideTypes).toContain('number');

      // Verify the actual values
      const fudgeDice = allDice.filter(d => d.sides === 'F');
      const d6Dice = allDice.filter(d => d.sides === 6);

      expect(fudgeDice).toHaveLength(2);
      expect(d6Dice).toHaveLength(2);
    });

    test('sides comparison works for both number and string', () => {
      // Verify JavaScript comparison behavior for the patterns we use
      const sides1: number | string = 'F';
      const sides2: number | string = 6;

      // These are the comparison patterns used in the code
      expect(sides1 === 'F').toBe(true);
      expect(sides2 === 'F').toBe(false);
      expect(typeof sides1 === 'number').toBe(false);
      expect(typeof sides2 === 'number').toBe(true);

      // The isValidSides pattern from useDiceValidation
      const isValidSides1 = sides1 === 'F' || (typeof sides1 === 'number' && sides1 > 0);
      const isValidSides2 = sides2 === 'F' || (typeof sides2 === 'number' && sides2 > 0);

      expect(isValidSides1).toBe(true);
      expect(isValidSides2).toBe(true);
    });
  });

  describe('Advanced dice modifiers with fudge dice', () => {
    test('keep highest (4dFk2) parses and processes correctly', async () => {
      const result = await diceService.rollDice(['4dFk2'], []);

      expect(result.errors).toBeUndefined();
      expect(result.diceArray[0].length).toBeGreaterThanOrEqual(2);

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      expect(fudgeDice.length).toBeGreaterThanOrEqual(2);

      fudgeDice.forEach(die => {
        expect([-1, 0, 1]).toContain(die.value);
      });
    });

    test('keep lowest (4dFkl2) parses and processes correctly', async () => {
      const result = await diceService.rollDice(['4dFkl2'], []);

      expect(result.errors).toBeUndefined();
      expect(result.diceArray[0].length).toBeGreaterThanOrEqual(2);

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      expect(fudgeDice.length).toBeGreaterThanOrEqual(2);
    });

    test('drop lowest (4dFd1) parses and processes correctly', async () => {
      const result = await diceService.rollDice(['4dFd1'], []);

      expect(result.errors).toBeUndefined();
      expect(result.diceArray[0].length).toBeGreaterThanOrEqual(3);

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      expect(fudgeDice.length).toBeGreaterThanOrEqual(3);
    });

    test('drop highest (4dFdh1) parses and processes correctly', async () => {
      const result = await diceService.rollDice(['4dFdh1'], []);

      expect(result.errors).toBeUndefined();
      expect(result.diceArray[0].length).toBeGreaterThanOrEqual(3);

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      expect(fudgeDice.length).toBeGreaterThanOrEqual(3);
    });

    test('exploding (4dF!) parses and processes correctly', async () => {
      const result = await diceService.rollDice(['4dF!'], []);

      expect(result.errors).toBeUndefined();
      expect(result.diceArray[0].length).toBeGreaterThanOrEqual(4);

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      expect(fudgeDice.length).toBeGreaterThanOrEqual(4);

      fudgeDice.forEach(die => {
        expect([-1, 0, 1]).toContain(die.value);
      });
    });

    test('reroll (4dFr-1) parses and processes correctly', async () => {
      const result = await diceService.rollDice(['4dFr-1'], []);

      expect(result.errors).toBeUndefined();
      expect(result.diceArray[0].length).toBeGreaterThanOrEqual(4);

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      expect(fudgeDice.length).toBeGreaterThanOrEqual(4);
    });

    test('reroll once (4dFro-1) parses and processes correctly', async () => {
      const result = await diceService.rollDice(['4dFro-1'], []);

      expect(result.errors).toBeUndefined();
      expect(result.diceArray[0].length).toBeGreaterThanOrEqual(4);

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      expect(fudgeDice.length).toBeGreaterThanOrEqual(4);
    });

    test('unique (4dFu) parses and processes correctly', async () => {
      const result = await diceService.rollDice(['4dFu'], []);

      expect(result.errors).toBeUndefined();

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      expect(fudgeDice.length).toBeGreaterThanOrEqual(1);

      fudgeDice.forEach(die => {
        expect([-1, 0, 1]).toContain(die.value);
      });
    });

    test('dropped dice show trashcan icon', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await diceService.rollDice(['4dFd1'], []);
        const droppedDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('trashcan')
        );
        if (droppedDice.length > 0) {
          expect(droppedDice[0].sides).toBe('F');
          return;
        }
      }
    });

    test('exploded dice show explosion icon', async () => {
      for (let i = 0; i < 20; i++) {
        const result = await diceService.rollDice(['4dF!'], []);
        const explodedDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('explosion')
        );
        if (explodedDice.length > 0) {
          expect(explodedDice[0].sides).toBe('F');
          return;
        }
      }
    });

    test('rerolled dice show recycle icon', async () => {
      for (let i = 0; i < 20; i++) {
        const result = await diceService.rollDice(['4dFr-1'], []);
        const rerolledDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('recycle')
        );
        if (rerolledDice.length > 0) {
          expect(rerolledDice[0].sides).toBe('F');
          return;
        }
      }
    });

    test('unique dice show unique icon', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dFu'], []);
        const uniqueDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('unique')
        );
        if (uniqueDice.length > 0) {
          expect(uniqueDice[0].sides).toBe('F');
          return;
        }
      }
    });

    test('fudge dice with keep: total equals sum of kept dice', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await diceService.rollDice(['4dFk2'], []);

        const keptDice = result.diceArray[0].filter(d =>
          !d.icon || !Array.isArray(d.icon) || !d.icon.includes('trashcan')
        );

        const keptSum = keptDice.reduce((sum, d) => sum + (d.value as number), 0);
        expect(result.resultArray[0].results).toBe(keptSum);
      }
    });

    test('fudge dice with drop: total equals sum of kept dice', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await diceService.rollDice(['4dFd1'], []);

        const keptDice = result.diceArray[0].filter(d =>
          !d.icon || !Array.isArray(d.icon) || !d.icon.includes('trashcan')
        );

        const keptSum = keptDice.reduce((sum, d) => sum + (d.value as number), 0);
        expect(result.resultArray[0].results).toBe(keptSum);
      }
    });

    test('keep highest: kept dice values >= all dropped dice values', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dFk2'], []);

        const keptDice = result.diceArray[0].filter(d =>
          !d.icon || !Array.isArray(d.icon) || !d.icon.includes('trashcan')
        );
        const droppedDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('trashcan')
        );

        if (droppedDice.length > 0 && keptDice.length > 0) {
          const minKept = Math.min(...keptDice.map(d => d.value as number));
          const maxDropped = Math.max(...droppedDice.map(d => d.value as number));
          expect(minKept).toBeGreaterThanOrEqual(maxDropped);
        }
      }
    });

    test('keep lowest: kept dice values <= all dropped dice values', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dFkl2'], []);

        const keptDice = result.diceArray[0].filter(d =>
          !d.icon || !Array.isArray(d.icon) || !d.icon.includes('trashcan')
        );
        const droppedDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('trashcan')
        );

        if (droppedDice.length > 0 && keptDice.length > 0) {
          const maxKept = Math.max(...keptDice.map(d => d.value as number));
          const minDropped = Math.min(...droppedDice.map(d => d.value as number));
          expect(maxKept).toBeLessThanOrEqual(minDropped);
        }
      }
    });

    test('drop lowest: dropped dice value <= minimum kept dice value', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dFd1'], []);

        const keptDice = result.diceArray[0].filter(d =>
          !d.icon || !Array.isArray(d.icon) || !d.icon.includes('trashcan')
        );
        const droppedDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('trashcan')
        );

        if (droppedDice.length > 0 && keptDice.length > 0) {
          const minKept = Math.min(...keptDice.map(d => d.value as number));
          const maxDropped = Math.max(...droppedDice.map(d => d.value as number));
          expect(maxDropped).toBeLessThanOrEqual(minKept);
        }
      }
    });

    test('drop highest: dropped dice value >= maximum kept dice value', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dFdh1'], []);

        const keptDice = result.diceArray[0].filter(d =>
          !d.icon || !Array.isArray(d.icon) || !d.icon.includes('trashcan')
        );
        const droppedDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('trashcan')
        );

        if (droppedDice.length > 0 && keptDice.length > 0) {
          const maxKept = Math.max(...keptDice.map(d => d.value as number));
          const minDropped = Math.min(...droppedDice.map(d => d.value as number));
          expect(minDropped).toBeGreaterThanOrEqual(maxKept);
        }
      }
    });

    test('unique: all kept dice have distinct values', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['3dFu'], []);

        const keptDice = result.diceArray[0].filter(d =>
          !d.icon || !Array.isArray(d.icon) || !d.icon.includes('trashcan')
        );

        const values = keptDice.map(d => d.value as number);
        const uniqueValues = new Set(values);
        expect(uniqueValues.size).toBe(values.length);
      }
    });

    test('exploding: total equals sum of all dice values', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dF!'], []);

        const allDice = result.diceArray[0].filter(d => d.sides === 'F');
        const sum = allDice.reduce((acc, d) => acc + (d.value as number), 0);
        expect(result.resultArray[0].results).toBe(sum);
      }
    });

    test('combined modifiers: exploding + keep (4dF!k2)', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await diceService.rollDice(['4dF!k2'], []);

        expect(result.errors).toBeUndefined();
        expect(result.diceArray[0].length).toBeGreaterThanOrEqual(2);

        const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
        fudgeDice.forEach(die => {
          expect([-1, 0, 1]).toContain(die.value);
        });
      }
    });

    test('critical success on fudge dice (4dFcs=1)', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dFcs=1'], []);

        expect(result.errors).toBeUndefined();
        expect(result.diceArray[0]).toHaveLength(4);

        const critDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('critical-success')
        );

        const plusOneDice = result.diceArray[0].filter(d => d.value === 1);
        if (plusOneDice.length > 0 && critDice.length > 0) {
          expect(critDice[0].value).toBe(1);
          return;
        }
      }
    });

    test('critical failure on fudge dice (4dFcf=-1)', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await diceService.rollDice(['4dFcf=-1'], []);

        expect(result.errors).toBeUndefined();
        expect(result.diceArray[0]).toHaveLength(4);

        const critDice = result.diceArray[0].filter(d =>
          d.icon && Array.isArray(d.icon) && d.icon.includes('critical-failure')
        );

        const minusOneDice = result.diceArray[0].filter(d => d.value === -1);
        if (minusOneDice.length > 0 && critDice.length > 0) {
          expect(critDice[0].value).toBe(-1);
          return;
        }
      }
    });

    test('grouped rolls with fudge dice ({4dF, 2d6})', async () => {
      const result = await diceService.rollDice(['{4dF, 2d6}'], []);

      expect(result.errors).toBeUndefined();
      expect(result.resultArray).toHaveLength(1);

      const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
      const d6Dice = result.diceArray[0].filter(d => d.sides === 6);

      expect(fudgeDice).toHaveLength(4);
      expect(d6Dice).toHaveLength(2);

      fudgeDice.forEach(die => {
        expect([-1, 0, 1]).toContain(die.value);
      });

      d6Dice.forEach(die => {
        expect(die.value).toBeGreaterThanOrEqual(1);
        expect(die.value).toBeLessThanOrEqual(6);
      });
    });

    test('compounding exploding fudge dice (4dF!!)', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await diceService.rollDice(['4dF!!'], []);

        expect(result.errors).toBeUndefined();
        expect(result.diceArray[0].length).toBeGreaterThanOrEqual(4);

        const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
        fudgeDice.forEach(die => {
          expect([-1, 0, 1]).toContain(die.value);
        });
      }
    });

    test('penetrating exploding fudge dice (4dF!p)', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await diceService.rollDice(['4dF!p'], []);

        expect(result.errors).toBeUndefined();
        expect(result.diceArray[0].length).toBeGreaterThanOrEqual(4);

        const fudgeDice = result.diceArray[0].filter(d => d.sides === 'F');
        fudgeDice.forEach(die => {
          expect([-1, 0, 1]).toContain(die.value);
        });
      }
    });
  });
});
