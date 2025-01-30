import { Hono } from 'hono';
import { DatabaseService } from '../../core/services/DatabaseService';
import { clerkMiddleware } from '@hono/clerk-auth';

const webhook = new Hono();
const db = DatabaseService.getInstance();

webhook.use('/webhook/clerk', clerkMiddleware());

webhook.post('/webhook/clerk', async (c) => {
  const event = await c.req.json();
  const { type, data } = event;

  if (type === 'user.created') {
    try {
      await db.handleWebLogin(data);
      return c.json({ received: true });
    } catch (err) {
      console.error('Error handling web login:', err);
      return c.json({ error: 'Failed to process user login' }, 500);
    }
  }
  return c.json({ received: true });
});

export default webhook;
