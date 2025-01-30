import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { DatabaseService } from '../../core/services/DatabaseService';

const router = new Hono();
const db = DatabaseService.getInstance();

router.use('*', clerkMiddleware());

const bigIntSerializer = (key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

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
    console.error('Error fetching mutual guilds:', err);
    return c.json({ error: 'Failed to fetch guilds' }, 500);
  }
});

export default router;