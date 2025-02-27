import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { Hono } from 'hono';
import { RollService } from '../../core/services/RollService';

const router = new Hono();
const rollService = RollService.getInstance();

router.use('*', clerkMiddleware());

router.post('/roll', async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { channelId, notation, source, username, timesToRepeat, title } = await c.req.json();

  if (!channelId || !notation) {
    return c.json({ error: 'Channel ID and Notation are required' }, 400);
  }

  try {
    const { isOverMax } = rollService.checkDiceLimits(notation);
    if (isOverMax) {
      return c.json({ error: 'Dice roll exceeds maximum limits (50 dice max, 100 sides max)' }, 400);
    }

    const rollResult = await rollService.rollDice({
      notation,
      channelId,
      username,
      source: 'web',
      timesToRepeat: timesToRepeat || 1,
      title
    });

    if (rollResult.errors && rollResult.errors.length > 0) {
      return c.json({ error: `Invalid notation: ${rollResult.errors.join(', ')}` }, 400);
    }

    const response = {
      message: rollResult.message || `Roll processed successfully`,
      diceArray: rollResult.diceArray,
      resultArray: rollResult.resultArray,
      imageData: rollResult.base64Image,
      channelName: rollResult.channelName,
      guildName: rollResult.guildName
    };

    return c.json(response, 200);
  } catch (err) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default router;