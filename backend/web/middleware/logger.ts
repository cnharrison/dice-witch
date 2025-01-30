import { MiddlewareHandler } from "hono";

export const logger = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const end = Date.now();
    console.log(`[${c.req.method}] ${c.req.url} - ${end - start}ms`);
  };
};