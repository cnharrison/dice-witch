import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { Hono } from 'hono';
import { availableDice } from '../../core/constants';
import { MAX_DELAY_MS } from '../../core/constants/index';
import { DiceService } from '../../core/services/DiceService';
import { DiscordService } from '../../core/services/DiscordService';
import { getRandomNumber } from '../../shared/helpers';

const router = new Hono();
const diceService = DiceService.getInstance();
const discordService = DiscordService.getInstance();

router.use('*', clerkMiddleware());

router.post('/roll', async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { channelId, notation } = await c.req.json();

  if (!channelId || !notation) {
    return c.json({ error: 'User ID, Channel ID, and Notation are required' }, 400);
  }

  try {
    await new Promise(resolve => setTimeout(resolve, getRandomNumber(MAX_DELAY_MS)));

    const { diceArray, resultArray, shouldHaveImage, errors } = diceService.rollDice([notation], availableDice);

    if (errors && errors.length > 0) {
      return c.json({ error: `Invalid notation: ${errors.join(', ')}` }, 400);
    }

    const diceAttachment = await diceService.generateDiceAttachment(diceArray);
    if (!diceAttachment) {
      return c.json({ error: 'Failed to generate dice image' }, 500);
    }

    const imageBuffer = diceAttachment.canvas.toBuffer('image/webp');
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    const embedMessage = await diceService.generateEmbedMessage({
      resultArray,
      attachment: diceAttachment.attachment,
    });

    const sent = await discordService.sendMessage(channelId, {
      embeds: embedMessage.embeds,
      files: embedMessage.files
    });

    const response = {
      message: 'Message sent to Discord channel',
      diceArray,
      resultArray,
      shouldHaveImage,
      imageData: base64Image
    };

    return c.json(response, 200);
  } catch (err) {
    console.error('Error in dice roll API:', err);
    return c.json({ error: 'Failed to roll dice or send message' }, 500);
  }
});

export default router;