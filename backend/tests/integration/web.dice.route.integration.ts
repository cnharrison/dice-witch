import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { Hono } from 'hono';

const mockCheckDiceLimits = jest.fn();
const mockRollDice = jest.fn();
const mockParseNotationArgs = jest.fn((raw: string) => [raw.trim()]);

jest.mock('../../core/services/RollService', () => ({
  parseNotationArgs: (raw: string) => mockParseNotationArgs(raw),
  RollService: {
    getInstance: () => ({
      checkDiceLimits: (...args: any[]) => mockCheckDiceLimits(...args),
      rollDice: (...args: any[]) => mockRollDice(...args),
    }),
  },
}));

jest.mock('../../web/routes/auth', () => {
  const sessions = new Map();
  sessions.set('test-session', {
    session: {
      user: { id: 'user-1', name: 'Test User', email: null, image: null, discordId: 'user-1' },
      expires: new Date(Date.now() + 100_000).toISOString(),
      accessToken: 'token',
    },
    expires: Date.now() + 100_000,
  });
  return { sessions };
});

import diceRouter from '../../web/routes/dice';

const app = new Hono();
app.route('/', diceRouter);

const authedPost = (body: Record<string, unknown>) =>
  app.request('/roll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'session_id=test-session' },
    body: JSON.stringify(body),
  });

const overMaxMessage = '50 dice max and 999 sides max, sorry 😅';

const validRollResult = {
  diceArray: [[{ sides: 20, rolled: 15, value: 15 }]],
  resultArray: [{ output: '1d20: 15', results: 15 }],
  message: 'Message sent to Discord channel general',
  channelName: 'general',
  guildName: 'Test Guild',
};

describe('Web /roll route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckDiceLimits.mockReturnValue({ isOverMax: false, containsDice: true });
    mockRollDice.mockResolvedValue(validRollResult);
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────

  test('returns 401 when no session cookie provided', async () => {
    const res = await app.request('/roll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: 'ch-1', notation: '1d20' }),
    });
    expect(res.status).toBe(401);
  });

  test('returns 401 when session cookie is invalid', async () => {
    const res = await app.request('/roll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'session_id=bad-session' },
      body: JSON.stringify({ channelId: 'ch-1', notation: '1d20' }),
    });
    expect(res.status).toBe(401);
  });

  // ─── Input validation ─────────────────────────────────────────────────────

  test('returns 400 when channelId is missing', async () => {
    const res = await authedPost({ notation: '1d20' });
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toMatch(/Channel ID and Notation are required/i);
  });

  test('returns 400 when notation is missing', async () => {
    const res = await authedPost({ channelId: 'ch-1' });
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toMatch(/Channel ID and Notation are required/i);
  });

  // ─── Limit enforcement ────────────────────────────────────────────────────

  test('returns 400 with over-max message when checkDiceLimits returns isOverMax', async () => {
    mockCheckDiceLimits.mockReturnValue({ isOverMax: true, containsDice: true });

    const res = await authedPost({ channelId: 'ch-1', notation: '100d20' });
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toBe(overMaxMessage);
    expect(json.message).toBe(overMaxMessage);
    expect(mockRollDice).not.toHaveBeenCalled();
  });

  test('returns 400 with over-max message when isOverMax due to unsafe exploding notation', async () => {
    mockCheckDiceLimits.mockReturnValue({
      isOverMax: true,
      containsDice: true,
      unsafeNotationReason: 'Expected exploded dice count exceeds the 50 dice image limit.',
    });

    const res = await authedPost({ channelId: 'ch-1', notation: 'd100!>0' });
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toBe(overMaxMessage);
    expect(mockRollDice).not.toHaveBeenCalled();
  });

  test('returns 400 with over-max message when post-roll DICE_OVER_MAX returned', async () => {
    mockRollDice.mockResolvedValue({
      diceArray: [],
      resultArray: [],
      errors: ['DICE_OVER_MAX'],
      message: overMaxMessage,
    });

    const res = await authedPost({ channelId: 'ch-1', notation: '10d20!<17' });
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toBe(overMaxMessage);
  });

  // ─── Errors from roll ─────────────────────────────────────────────────────

  test('returns 403 when PERMISSION_ERROR returned', async () => {
    mockRollDice.mockResolvedValue({
      diceArray: [],
      resultArray: [],
      errors: ['PERMISSION_ERROR'],
      message: 'Dice Witch needs permission to read message history, attach files, and embed links to show you the dice. 😊',
    });

    const res = await authedPost({ channelId: 'ch-1', notation: '1d20' });
    expect(res.status).toBe(403);
    const json = await res.json() as any;
    expect(json.error).toBe('PERMISSION_ERROR');
  });

  test('returns 400 when roll returns errors with no results', async () => {
    mockRollDice.mockResolvedValue({
      diceArray: [],
      resultArray: [],
      errors: ['Invalid notation: bad'],
    });

    const res = await authedPost({ channelId: 'ch-1', notation: 'bad' });
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toMatch(/Invalid notation/);
  });

  // ─── Successful roll ──────────────────────────────────────────────────────

  test('returns 200 with roll result on valid notation', async () => {
    const res = await authedPost({ channelId: 'ch-1', notation: '1d20', username: 'alice' });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.message).toBe('Message sent to Discord channel general');
    expect(json.channelName).toBe('general');
    expect(json.resultArray).toHaveLength(1);
  });

  test('passes parseNotationArgs output to checkDiceLimits and rollDice', async () => {
    mockParseNotationArgs.mockReturnValue(['1d20', '1d6']);

    await authedPost({ channelId: 'ch-1', notation: '1d20 1d6' });

    expect(mockParseNotationArgs).toHaveBeenCalledWith('1d20 1d6');
    expect(mockCheckDiceLimits).toHaveBeenCalledWith(['1d20', '1d6'], 1);
    expect(mockRollDice).toHaveBeenCalledWith(expect.objectContaining({
      notation: ['1d20', '1d6'],
    }));
  });

  test('passes timesToRepeat to checkDiceLimits', async () => {
    await authedPost({ channelId: 'ch-1', notation: '1d20', timesToRepeat: 3 });

    expect(mockCheckDiceLimits).toHaveBeenCalledWith(expect.any(Array), 3);
    expect(mockRollDice).toHaveBeenCalledWith(expect.objectContaining({ timesToRepeat: 3 }));
  });
});
