import { describe, test, expect } from '@jest/globals';
import { buildCommandArgs } from '../../discord/events/index';

describe('buildCommandArgs', () => {
  // ─── Roll notation (diceNotation present) ─────────────────────────────────

  test('returns single-expression notation as one-element array', () => {
    expect(buildCommandArgs('1d20', null, 'roll')).toEqual(['1d20']);
  });

  test('keeps expression with operators as single element', () => {
    expect(buildCommandArgs('2d20 + 5', null, 'roll')).toEqual(['2d20 + 5']);
  });

  test('splits multi-roll notation into separate args', () => {
    expect(buildCommandArgs('2d20 1d10', null, 'roll')).toEqual(['2d20', '1d10']);
  });

  test('trims whitespace from notation before parsing', () => {
    expect(buildCommandArgs('  1d20  ', null, 'roll')).toEqual(['1d20']);
  });

  test('splits repeated notation correctly', () => {
    expect(buildCommandArgs('1d20+9 1d20+9 1d20+9', null, 'roll')).toEqual([
      '1d20+9', '1d20+9', '1d20+9',
    ]);
  });

  test('diceNotation takes precedence over topic', () => {
    expect(buildCommandArgs('1d20', 'exploding', 'knowledgebase')).toEqual(['1d20']);
  });

  // ─── Knowledgebase topic ──────────────────────────────────────────────────

  test('returns lowercased topic array for knowledgebase command', () => {
    expect(buildCommandArgs(null, 'EXPLODING', 'knowledgebase')).toEqual(['exploding']);
  });

  test('returns topic for knowledgebase when diceNotation is absent', () => {
    expect(buildCommandArgs(undefined, 'reroll', 'knowledgebase')).toEqual(['reroll']);
  });

  test('does not apply knowledgebase logic to other commands', () => {
    // topic present but commandName is not "knowledgebase" — falls through to unformatted path
    expect(buildCommandArgs(null, 'some-topic', 'status')).toEqual(['topic']);
  });

  // ─── Topic slug fallback (unformatted) ────────────────────────────────────

  test('returns second segment of hyphenated topic for non-knowledgebase commands', () => {
    expect(buildCommandArgs(null, 'prefix-reroll', 'status')).toEqual(['reroll']);
  });

  test('returns empty array when topic has no hyphen and command is not knowledgebase', () => {
    // No hyphen in topic → split produces single element → unformattedArgs[1] is undefined → []
    expect(buildCommandArgs(null, 'singletopic', 'status')).toEqual([]);
  });

  // ─── Empty / missing ──────────────────────────────────────────────────────

  test('returns empty array when no notation or topic', () => {
    expect(buildCommandArgs(null, null, 'roll')).toEqual([]);
  });

  test('returns empty array for undefined inputs', () => {
    expect(buildCommandArgs(undefined, undefined, 'roll')).toEqual([]);
  });

  test('returns empty array for empty string notation', () => {
    expect(buildCommandArgs('', null, 'roll')).toEqual([]);
  });
});
