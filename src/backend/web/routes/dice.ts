import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { TextChannel } from 'discord.js';
import { Hono } from 'hono';
import { availableDice } from '../../core/constants';
import { MAX_DELAY_MS } from '../../core/constants/index';
import { DiceService } from '../../core/services/DiceService';
import { discord } from '../../discord/app';
import { getRandomNumber } from '../../shared/helpers';

const router = new Hono();
const diceService = DiceService.getInstance();

router.use('*', clerkMiddleware());

router.post('/roll', async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { userId, channelId, notation } = await c.req.json();

  if (!userId || !channelId || !notation) {
    return c.json({ error: 'User ID, Channel ID, and Notation are required' }, 400);
  }

  try {
    await new Promise(resolve => setTimeout(resolve, getRandomNumber(MAX_DELAY_MS)));

    const { diceArray, resultArray, errors } = diceService.rollDice([notation], availableDice);

    if (errors && errors.length > 0) {
      return c.json({ error: `Invalid notation: ${errors.join(', ')}` }, 400);
    }

    const diceAttachment = await diceService.generateDiceAttachment(diceArray);
    if (!diceAttachment) {
      return c.json({ error: 'Failed to generate dice image' }, 500);
    }

    const embedMessage = await diceService.generateEmbedMessage({
      resultArray,
      attachment: diceAttachment.attachment,
    });

    const result = await discord.shard?.broadcastEval(async (client) => {
      const channel = await client.channels.fetch(channelId);
      if (channel?.isTextBased() && channel instanceof TextChannel) {
        await channel.send({ embeds: embedMessage.embeds, files: embedMessage.files });
        return true;
      }
      return false;
    });

    if (result?.some(success => success)) {
      return c.json({ message: 'Message sent to Discord channel' }, 200);
    } else {
      return c.json({ error: 'Channel not found or not a text channel' }, 404);
    }
  } catch (err) {
    console.error('Error rolling dice or sending message:', err);
    return c.json({ error: 'Failed to roll dice or send message' }, 500);
  }
});

export default router;