import { describe, test, expect } from '@jest/globals';
import { parseNotationArgs } from '../../core/services/RollService';

describe('parseNotationArgs', () => {
  // ─── empty / whitespace ────────────────────────────────────────────────────
  describe('empty and whitespace input', () => {
    test('empty string returns empty array', () => {
      expect(parseNotationArgs('')).toEqual([]);
    });

    test('whitespace-only string returns empty array', () => {
      expect(parseNotationArgs('   ')).toEqual([]);
    });

    test('tabs and newlines return empty array', () => {
      expect(parseNotationArgs('\t\n')).toEqual([]);
    });
  });

  // ─── single valid expressions (must NOT be split) ─────────────────────────
  // These are all single dice notation expressions that the parser accepts in
  // full. They must be passed as a single element so operators and whitespace
  // within the expression are preserved (e.g. "2d20 + 5" must not be split on
  // the spaces around "+").
  describe('single valid expression — kept as one element', () => {
    test('simple die', () => {
      expect(parseNotationArgs('1d20')).toEqual(['1d20']);
    });

    test('die without count prefix', () => {
      expect(parseNotationArgs('d6')).toEqual(['d6']);
    });

    test('expression with + operator and spaces', () => {
      expect(parseNotationArgs('2d20 + 5')).toEqual(['2d20 + 5']);
    });

    test('expression with + operator no spaces', () => {
      expect(parseNotationArgs('2d20+5')).toEqual(['2d20+5']);
    });

    test('expression with - operator and spaces', () => {
      expect(parseNotationArgs('1d8 - 2')).toEqual(['1d8 - 2']);
    });

    test('expression with * operator', () => {
      expect(parseNotationArgs('(2d6) * 3')).toEqual(['(2d6) * 3']);
    });

    test('expression with / operator', () => {
      expect(parseNotationArgs('4d6 / 2')).toEqual(['4d6 / 2']);
    });

    test('keep highest notation', () => {
      expect(parseNotationArgs('4d6k3')).toEqual(['4d6k3']);
    });

    test('drop lowest notation', () => {
      expect(parseNotationArgs('4d6dl1')).toEqual(['4d6dl1']);
    });

    test('exploding dice', () => {
      expect(parseNotationArgs('1d6!')).toEqual(['1d6!']);
    });

    test('exploding dice with comparepoint', () => {
      expect(parseNotationArgs('1d6!>4')).toEqual(['1d6!>4']);
    });

    test('compound exploding dice', () => {
      expect(parseNotationArgs('10d10!!rk4')).toEqual(['10d10!!rk4']);
    });

    test('penetrating exploding dice', () => {
      expect(parseNotationArgs('4d6!p=6')).toEqual(['4d6!p=6']);
    });

    test('reroll modifier', () => {
      expect(parseNotationArgs('4d6r<2')).toEqual(['4d6r<2']);
    });

    test('target success', () => {
      expect(parseNotationArgs('8d6>=5')).toEqual(['8d6>=5']);
    });

    test('critical success/failure', () => {
      expect(parseNotationArgs('4d20s!!=17k2min10cs=20cf=1+9')).toEqual(['4d20s!!=17k2min10cs=20cf=1+9']);
    });

    test('percentile die', () => {
      expect(parseNotationArgs('d%')).toEqual(['d%']);
    });

    test('fudge die', () => {
      expect(parseNotationArgs('4dF')).toEqual(['4dF']);
    });

    test('fudge die variant', () => {
      expect(parseNotationArgs('4dF.1')).toEqual(['4dF.1']);
    });

    test('grouped dice notation', () => {
      expect(parseNotationArgs('{4d6k2}+{3d10!>8}')).toEqual(['{4d6k2}+{3d10!>8}']);
    });

    test('complex notation with modifier and separate expression is a multi-roll', () => {
      // "1d100cf>=78cs<=15" and "4d6+1" are two separate expressions
      expect(parseNotationArgs('1d100cf>=78cs<=15 4d6+1')).toEqual(['1d100cf>=78cs<=15', '4d6+1']);
    });

    test('complex single expression with multiple operators', () => {
      expect(parseNotationArgs('2d6 + 1d4 - 1')).toEqual(['2d6 + 1d4 - 1']);
    });

    test('expression with math functions', () => {
      expect(parseNotationArgs('floor(1d6 / 2)')).toEqual(['floor(1d6 / 2)']);
    });

    test('leading/trailing whitespace is trimmed from single expression', () => {
      expect(parseNotationArgs('  1d20  ')).toEqual(['1d20']);
    });

    test('expression with spaces and modifier', () => {
      expect(parseNotationArgs('1d20 + 9')).toEqual(['1d20 + 9']);
    });
  });

  // ─── multi-roll (must be split) ────────────────────────────────────────────
  // These inputs contain multiple space-separated dice expressions that the
  // parser cannot parse as a single expression. They are split on whitespace
  // so each term is rolled individually.
  describe('multi-roll input — split into multiple elements', () => {
    test('two simple dice separated by space', () => {
      expect(parseNotationArgs('2d20 1d10')).toEqual(['2d20', '1d10']);
    });

    test('two dice with modifiers separated by space', () => {
      expect(parseNotationArgs('1d8 1d6')).toEqual(['1d8', '1d6']);
    });

    test('repeated notation (timestorepeat-style)', () => {
      expect(parseNotationArgs('1d20+9 1d20+9')).toEqual(['1d20+9', '1d20+9']);
    });

    test('three repeated notations', () => {
      expect(parseNotationArgs('1d20+9 1d20+9 1d20+9')).toEqual(['1d20+9', '1d20+9', '1d20+9']);
    });

    test('two dice with keep modifier separated by space', () => {
      expect(parseNotationArgs('d8 2d4k1')).toEqual(['d8', '2d4k1']);
    });

    test('three sorted dice rolls', () => {
      expect(parseNotationArgs('5d6s 5d6s 3d6s')).toEqual(['5d6s', '5d6s', '3d6s']);
    });

    test('two large dice groups', () => {
      expect(parseNotationArgs('10d20 10d20')).toEqual(['10d20', '10d20']);
    });

    test('two percentile dice', () => {
      expect(parseNotationArgs('d100 d100')).toEqual(['d100', 'd100']);
    });

    test('three different dice types', () => {
      expect(parseNotationArgs('d16 d18 d20')).toEqual(['d16', 'd18', 'd20']);
    });

    test('three dice with drop modifier', () => {
      expect(parseNotationArgs('d8 2d4 2d4kl1')).toEqual(['d8', '2d4', '2d4kl1']);
    });

    test('multiple spaces between terms are treated as one delimiter', () => {
      expect(parseNotationArgs('1d6  1d8')).toEqual(['1d6', '1d8']);
    });
  });

  // ─── invalid / malformed notation ─────────────────────────────────────────
  describe('invalid or malformed notation', () => {
    test('purely invalid token is returned as single element (handled downstream)', () => {
      expect(parseNotationArgs('notdice')).toEqual(['notdice']);
    });

    test('numeric-only string is returned as single element', () => {
      expect(parseNotationArgs('42')).toEqual(['42']);
    });

    test('special characters returned as single element', () => {
      expect(parseNotationArgs('!@#$')).toEqual(['!@#$']);
    });

    test('invalid single expression with bad token is split', () => {
      // Parser fails on "2d20 + foo" because "foo" is not valid, so splits
      expect(parseNotationArgs('2d20 + foo')).toEqual(['2d20', '+', 'foo']);
    });

    test('invalid multi-token with bad tokens splits normally', () => {
      expect(parseNotationArgs('notdice at all')).toEqual(['notdice', 'at', 'all']);
    });
  });
});
