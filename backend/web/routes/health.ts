import { Hono } from 'hono';

const router = new Hono();

// Simple health check endpoint for load balancer
router.get('/', (c) => {
  return c.json({ status: "ok" });
});

export default router;