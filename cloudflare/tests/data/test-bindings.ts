import { env } from "cloudflare:workers";
import type { D1Migration } from "cloudflare:test";
import { z } from "zod";

const TestMigrationsBindingSchema = z.object({
  TEST_MIGRATIONS: z.array(z.strictObject({
    name: z.string(),
    queries: z.array(z.string()),
  })),
});

export const dataTestEnv = {
  DATA: env.DATA,
  ...TestMigrationsBindingSchema.parse(env),
} satisfies { DATA: D1Database; TEST_MIGRATIONS: D1Migration[] };
