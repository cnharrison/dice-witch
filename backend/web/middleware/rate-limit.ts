import { MiddlewareHandler } from 'hono';

const requestCounts = new Map<string, { count: number, resetTime: number, timeoutId?: NodeJS.Timeout }>();
const MAX_ENTRIES = 10000;
const CLEANUP_INTERVAL = 5 * 60 * 1000;

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

const cleanupExpiredEntries = () => {
  const now = Date.now();
  let deletedCount = 0;
  
  requestCounts.forEach((data, ip) => {
    if (data.resetTime < now) {
      if (data.timeoutId) {
        clearTimeout(data.timeoutId);
      }
      requestCounts.delete(ip);
      deletedCount++;
    }
  });
  
  if (requestCounts.size > MAX_ENTRIES) {
    const entriesToRemove = [...requestCounts.entries()]
      .sort((a, b) => a[1].resetTime - b[1].resetTime)
      .slice(0, requestCounts.size - MAX_ENTRIES);
      
    for (const [ip, data] of entriesToRemove) {
      if (data.timeoutId) {
        clearTimeout(data.timeoutId);
      }
      requestCounts.delete(ip);
      deletedCount++;
    }
  }
};

const cleanupInterval = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL);
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

export const rateLimit = (options: RateLimitOptions): MiddlewareHandler => {
  const { limit, windowMs } = options;

  return async (c, next) => {
    cleanupExpiredEntries();
    const forwardedFor = c.req.header('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
    const now = Date.now();
    
    const data = requestCounts.get(ip);
    
    if (!data || data.resetTime < now) {
      if (data?.timeoutId) {
        clearTimeout(data.timeoutId);
      }
      
      const timeoutId = setTimeout(() => {
        requestCounts.delete(ip);
      }, windowMs);
      
      if (timeoutId.unref) {
        timeoutId.unref();
      }
      
      requestCounts.set(ip, {
        count: 1,
        resetTime: now + windowMs,
        timeoutId
      });
    } else {
      data.count++;
      requestCounts.set(ip, data);
    }
    
    const currentData = requestCounts.get(ip)!;
    
    if (currentData.count > limit) {
      c.status(429);
      return c.json({ 
        error: 'Too many requests', 
        message: 'Rate limit exceeded'
      });
    }
    
    c.header('X-RateLimit-Limit', limit.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, limit - currentData.count).toString());
    c.header('X-RateLimit-Reset', Math.ceil(currentData.resetTime / 1000).toString());
    
    return next();
  };
};
