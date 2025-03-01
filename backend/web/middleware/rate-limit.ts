import { MiddlewareHandler } from 'hono';

const requestCounts: Record<string, { count: number, resetTime: number }> = {};

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const rateLimit = (options: RateLimitOptions): MiddlewareHandler => {
  const { limit, windowMs } = options;

  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for') || 'unknown';
    const now = Date.now();
    
    if (!requestCounts[ip] || requestCounts[ip].resetTime < now) {
      requestCounts[ip] = {
        count: 0,
        resetTime: now + windowMs
      };
      
      setTimeout(() => {
        delete requestCounts[ip];
      }, windowMs);
    }
    
    requestCounts[ip].count++;
    
    if (requestCounts[ip].count > limit) {
      return c.json({ 
        error: 'Too many requests', 
        message: 'Rate limit exceeded'
      }, 429);
    }
    
    c.header('X-RateLimit-Limit', limit.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, limit - requestCounts[ip].count).toString());
    c.header('X-RateLimit-Reset', Math.ceil(requestCounts[ip].resetTime / 1000).toString());
    
    await next();
  };
};