import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { DatabaseService } from '../../core/services/DatabaseService';
import { DiscordService } from '../../core/services/DiscordService';
import { bigIntSerializer } from '../../shared/utils';

const router = new Hono();
const db = DatabaseService.getInstance();

import { sessions } from './auth';

async function authMiddleware(c, next) {
  const sessionId = getCookie(c, 'session_id');

  if (!sessionId || !sessions.has(sessionId)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = sessions.get(sessionId);
  c.set('session', session);
  c.set('user', session.user);

  await next();
}

router.use('*', authMiddleware);

router.get('/mutual', async (c) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    if (!user.discordId) {
      return c.json({ error: 'No Discord account connected' }, 400);
    }

    const guilds = await db.getMutualGuildsWithPermissions(user.discordId);

    return new Response(JSON.stringify({ guilds }, bigIntSerializer), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch guilds' }, 500);
  }
});

router.get('/:guildId/preferences', async (c) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const rawGuildId = c.req.param('guildId');

  try {
    if (!user.discordId) {
      return c.json({ error: 'No Discord account connected' }, 400);
    }

    const guilds = await db.getMutualGuildsWithPermissions(user.discordId);
    const normalizedGuildId = rawGuildId.toString();

    const guild = guilds.find(g => {
      const guildId = g.guilds?.id.toString();
      return guildId === normalizedGuildId;
    });

    if (!guild || (!guild.isAdmin && !guild.isDiceWitchAdmin)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const guildSettings = await db.getGuildSettings(normalizedGuildId);
    return c.json({ preferences: guildSettings });
  } catch (err) {
    return c.json({ error: 'Failed to fetch guild preferences' }, 500);
  }
});

router.patch('/:guildId/preferences', async (c) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const rawGuildId = c.req.param('guildId');

  try {
    if (!user.discordId) {
      return c.json({ error: 'No Discord account connected' }, 400);
    }

    const guilds = await db.getMutualGuildsWithPermissions(user.discordId);
    const normalizedGuildId = rawGuildId.toString();

    const guild = guilds.find(g => {
      const guildId = g.guilds?.id.toString();
      return guildId === normalizedGuildId;
    });

    if (!guild || (!guild.isAdmin && !guild.isDiceWitchAdmin)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();

    await db.updateGuildPreferences(normalizedGuildId, {
      skipDiceDelay: body.skipDiceDelay
    });

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to update guild preferences' }, 500);
  }
});

router.get('/:guildId/channels', async (c) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const rawGuildId = c.req.param('guildId');

  try {
    if (!user.discordId) {
      return c.json({ error: 'No Discord account connected' }, 400);
    }

    const guilds = await db.getMutualGuildsWithPermissions(user.discordId);
    const normalizedGuildId = BigInt(rawGuildId).toString();

    const guild = guilds.find(g => {
      const guildId = g.guilds?.id.toString();
      return guildId === normalizedGuildId;
    });

    if (!guild || (!guild.isAdmin && !guild.isDiceWitchAdmin)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const discordService = DiscordService.getInstance();
    const channels = await discordService.getTextChannels(normalizedGuildId);

    return c.json({ channels });
  } catch (err) {
    return c.json({ error: 'Failed to fetch channels' }, 500);
  }
});

export default router;