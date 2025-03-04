import { Hono } from 'hono';
import { cache } from 'hono/cache';
import { rateLimit } from '../middleware/rate-limit';
import { DiscordService } from '../../core/services/DiscordService';

const router = new Hono();
const discord = DiscordService.getInstance();

router.get('/public', 
  rateLimit({
    limit: 5,
    windowMs: 60 * 1000,
  }),
  cache({
    cacheName: 'dice-witch-stats',
    cacheControl: 'max-age=300',
  }),
  async (c) => {
    try {
      const userCount = await discord.getUserCount();
      
      return c.json({
        servers: userCount.totalGuilds,
        users: userCount.totalMembers
      });
    } catch (err) {
      console.error('Error fetching public stats:', err);
      return c.json({ error: 'Failed to fetch stats' }, 500);
    }
  }
);

export default router;