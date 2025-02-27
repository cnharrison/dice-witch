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

  const { channelId, notation, source, username } = await c.req.json();

  if (!channelId || !notation) {
    return c.json({ error: 'Channel ID and Notation are required' }, 400);
  }

  try {
    // Check dice limits
    const { isOverMax } = rollService.checkDiceLimits(notation);
    if (isOverMax) {
      return c.json({ error: 'Dice roll exceeds maximum limits' }, 400);
    }

    const rollResult = await rollService.rollDice({
      notation,
      channelId,
      username,
      source: 'web'
    });

    if (rollResult.errors && rollResult.errors.length > 0) {
      return c.json({ error: `Invalid notation: ${rollResult.errors.join(', ')}` }, 400);
    }

    const response = {
      message: rollResult.message || `Roll processed successfully`,
      diceArray: rollResult.diceArray,
      resultArray: rollResult.resultArray,
      shouldHaveImage: rollResult.shouldHaveImage,
      ...(rollResult.shouldHaveImage ? { imageData: rollResult.base64Image } : {}),
      channelName: rollResult.channelName,
      guildName: rollResult.guildName
    };

    return c.json(response, 200);
  } catch (err) {
    console.error('Error processing dice roll:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default router;