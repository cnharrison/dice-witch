import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { RollService, parseNotationArgs } from '../../core/services/RollService';
import { maxDiceSides, maxImageDice } from '../../core/constants';
import { SessionData, SessionUser, sessions } from './auth';

type AuthVariables = {
  session: SessionData;
  user: SessionUser;
};

const router = new Hono<{ Variables: AuthVariables }>();
const rollService = RollService.getInstance();
const overMaxMessage = `${maxImageDice} dice max and ${maxDiceSides} sides max, sorry 😅`;

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
    const timesToRepeatAsNumber = Number(timesToRepeat) || 1;
    const parsedNotation = parseNotationArgs(notation);
    const { isOverMax, unsafeNotationReason } = rollService.checkDiceLimits(parsedNotation, timesToRepeatAsNumber);

    if (isOverMax) {
      if (unsafeNotationReason) {
        console.warn(`[web /roll] Over max due exploding notation: ${unsafeNotationReason} | notation: ${notation}`);
      }
      return c.json({ error: overMaxMessage, message: overMaxMessage }, 400);
    }

    let response;
    try {
      const rollResult = await rollService.rollDice({
        notation: parsedNotation,
        channelId,
        username,
        source: 'web',
        timesToRepeat: timesToRepeatAsNumber
      });

      if (rollResult.errors?.includes('DICE_OVER_MAX')) {
        const message = rollResult.message || overMaxMessage;
        return c.json({ error: message, message }, 400);
      }

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
