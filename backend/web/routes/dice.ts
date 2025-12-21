import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { RollService } from '../../core/services/RollService';
import { SessionData, SessionUser, sessions } from './auth';

type AuthVariables = {
  session: SessionData;
  user: SessionUser;
};

const router = new Hono<{ Variables: AuthVariables }>();
const rollService = RollService.getInstance();

async function authMiddleware(c: Context, next: Next) {
  const sessionId = getCookie(c, 'session_id');
  
  const record = sessionId ? sessions.get(sessionId) : null;
  if (!record) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const session = record.session;
  c.set('session', session);
  c.set('user', session.user);
  
  return await next();
}

router.use('*', authMiddleware);

router.post('/roll', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { channelId, notation, username, timesToRepeat } = await c.req.json();

  if (!channelId || !notation) {
    return c.json({ error: 'Channel ID and Notation are required' }, 400);
  }

  try {
    const { isOverMax } = rollService.checkDiceLimits(notation);
    if (isOverMax) {
      return c.json({ error: 'Dice roll exceeds maximum limits (50 dice max, 100 sides max)' }, 400);
    }

    let response;
    try {
      const rollResult = await rollService.rollDice({
        notation,
        channelId,
        username,
        source: 'web',
        timesToRepeat: timesToRepeat || 1
      });

      if (rollResult.errors?.includes('PERMISSION_ERROR')) {
        return c.json({
          error: 'PERMISSION_ERROR',
          message: rollResult.message || 'Dice Witch needs permission to read message history, attach files, and embed links to show you the dice. 😊',
          diceArray: rollResult.diceArray || [],
          resultArray: rollResult.resultArray || []
        }, 403);
      }

      if (rollResult.errors && rollResult.errors.length > 0 && (!rollResult.resultArray || rollResult.resultArray.length === 0)) {
        return c.json({ 
          error: `Invalid notation: ${rollResult.errors.join(', ')}`,
          message: `Invalid notation: ${rollResult.errors.join(', ')}`,
          diceArray: [],
          resultArray: []
        }, 400);
      }

      response = {
        message: rollResult.message || `Roll processed successfully`,
        diceArray: rollResult.diceArray || [],
        resultArray: rollResult.resultArray || [],
        channelName: rollResult.channelName,
        guildName: rollResult.guildName
      };
    } catch (error) {
      console.error("Roll error:", error);
      return c.json({ 
        error: 'Error processing dice roll',
        message: 'Error processing dice roll. Please try a different notation.',
        diceArray: [],
        resultArray: []
      }, 500);
    }

    return c.json(response, 200);
  } catch (err) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default router;
