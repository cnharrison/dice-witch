import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { Hono } from 'hono';
import { DatabaseService } from '../../core/services/DatabaseService';
import { DiscordService } from '../../core/services/DiscordService';
import { bigIntSerializer } from '../../shared/utils';

const router = new Hono();
const db = DatabaseService.getInstance();

router.use('*', clerkMiddleware());

router.get('/mutual', async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const clerkClient = c.get('clerk');
    const user = await clerkClient.users.getUser(auth.userId);

    const discordAccount = user.externalAccounts.find(
      account => account.provider === 'oauth_discord'
    );

    if (!discordAccount?.id) {
      return c.json({ error: 'No Discord account connected' }, 400);
    }

    const guilds = await db.getMutualGuildsWithPermissions(discordAccount.externalId);

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
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const rawGuildId = c.req.param('guildId');

  try {
    const clerkClient = c.get('clerk');
    const user = await clerkClient.users.getUser(auth.userId);
    const discordAccount = user.externalAccounts.find(
      account => account.provider === 'oauth_discord'
    );

    if (!discordAccount?.id) {
      return c.json({ error: 'No Discord account connected' }, 400);
    }

    const guilds = await db.getMutualGuildsWithPermissions(discordAccount.externalId);
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
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const rawGuildId = c.req.param('guildId');
  
  try {
    const clerkClient = c.get('clerk');
    const user = await clerkClient.users.getUser(auth.userId);
    const discordAccount = user.externalAccounts.find(
      account => account.provider === 'oauth_discord'
    );

    if (!discordAccount?.id) {
      return c.json({ error: 'No Discord account connected' }, 400);
    }

    const guilds = await db.getMutualGuildsWithPermissions(discordAccount.externalId);
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
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const rawGuildId = c.req.param('guildId');

  try {
    const clerkClient = c.get('clerk');
    const user = await clerkClient.users.getUser(auth.userId);
    const discordAccount = user.externalAccounts.find(
      account => account.provider === 'oauth_discord'
    );

    if (!discordAccount?.id) {
      return c.json({ error: 'No Discord account connected' }, 400);
    }

    const guilds = await db.getMutualGuildsWithPermissions(discordAccount.externalId);
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