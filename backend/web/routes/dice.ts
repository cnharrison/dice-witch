import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { Hono } from 'hono';
import { availableDice } from '../../core/constants';
import { MAX_DELAY_MS } from '../../core/constants/index';
import { DiceService } from '../../core/services/DiceService';
import { DiscordService } from '../../core/services/DiscordService';
import { getRandomNumber } from '../../shared/helpers';
import { sendLogEventMessage } from '../../discord/messages/sendLogEventMessage';
import { EventType } from '../../shared/types';

const router = new Hono();
const diceService = DiceService.getInstance();
const discordService = DiscordService.getInstance();

router.use('*', clerkMiddleware());

router.post('/roll', async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { channelId, notation, source, username } = await c.req.json();

  if (!channelId || !notation) {
    return c.json({ error: 'User ID, Channel ID, and Notation are required' }, 400);
  }

  try {
    const { diceArray, resultArray, shouldHaveImage, errors } = await diceService.rollDice([notation], availableDice);

    if (errors && errors.length > 0) {
      return c.json({ error: `Invalid notation: ${errors.join(', ')}` }, 400);
    }

    const channel = await discordService.getChannel(channelId);
    const channelName = channel?.name || 'unknown channel';
    const guildName = channel?.guild?.name || '';

    let diceAttachment;
    let base64Image = '';

    if (shouldHaveImage && diceArray.some(group => group.length > 0)) {
      diceAttachment = await diceService.generateDiceAttachment(diceArray);
      if (!diceAttachment) {
        return c.json({ error: 'Failed to generate dice image' }, 500);
      }

      const imageBuffer = diceAttachment.canvas.toBuffer('image/webp');
      base64Image = Buffer.from(imageBuffer).toString('base64');
    }

    const embedMessage = await diceService.generateEmbedMessage({
      resultArray,
      attachment: diceAttachment?.attachment,
      source: source || 'web',
      username: username
    });

    const sent = await discordService.sendMessage(channelId, {
      embeds: embedMessage.embeds,
      files: embedMessage.files
    });

    if (diceAttachment?.attachment) {
      try {
        const files = [{
          name: 'currentDice.png',
          attachment: Buffer.isBuffer(diceAttachment.attachment) ? diceAttachment.attachment : null
        }].filter(file => file.attachment !== null);

        if (files.length > 0) {
          await sendLogEventMessage({
            eventType: EventType.RECEIVED_COMMAND,
            args: notation,
            guild: channel?.guild,
            files: files,
            sourceName: 'web',
            username: username,
            channelName: channelName,
            guildName: guildName
          });
        } else {
          await sendLogEventMessage({
            eventType: EventType.RECEIVED_COMMAND,
            args: notation,
            guild: channel?.guild,
            sourceName: 'web',
            username: username,
            channelName: channelName,
            guildName: guildName
          });
        }
      } catch (error) {
        console.error('Failed to send to log channel:', error);
      }
    } else if (resultArray.length > 0) {
      try {
        await sendLogEventMessage({
          eventType: EventType.RECEIVED_COMMAND,
          args: notation,
          guild: channel?.guild,
          sourceName: 'web',
          username: username,
          channelName: channelName,
          guildName: guildName
        });
      } catch (error) {
        console.error('Failed to send text dice roll to log channel:', error);
      }
    }

    const response = {
      message: `Message sent to Discord channel ${channelName}`,
      diceArray,
      resultArray,
      shouldHaveImage,
      ...(shouldHaveImage ? { imageData: base64Image } : {}),
      channelName,
      guildName
    };

    return c.json(response, 200);
  } catch (err) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default router;