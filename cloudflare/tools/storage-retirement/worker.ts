import { z } from "zod";
import type { RollWork, LogWork } from "../../workers/roll/src/index";

/** Temporary maintenance transport; deploy only with release authorization.
 * The target identity is checked before invoking the owner's refusal-safe RPC.
 */
interface RetirementBindings {
  TARGET: DurableObjectNamespace<RollWork> | DurableObjectNamespace<LogWork>;
  RETIREMENT_TOKEN: string;
  ACCOUNT_ID: string;
  NAMESPACE_ID: string;
}

const TargetSchema = z.strictObject({
  accountId: z.string().regex(/^[a-f0-9]{32}$/),
  namespaceId: z.string().regex(/^[a-f0-9]{32}$/),
  id: z.string().regex(/^[a-f0-9]{64}$/),
});

export default {
  async fetch(request: Request, env: RetirementBindings): Promise<Response> {
    const encoder = new TextEncoder();
    const supplied = await crypto.subtle.digest("SHA-256", encoder.encode(request.headers.get("authorization") ?? ""));
    const expected = await crypto.subtle.digest("SHA-256", encoder.encode(`Bearer ${env.RETIREMENT_TOKEN}`));
    if (!env.RETIREMENT_TOKEN || !crypto.subtle.timingSafeEqual(supplied, expected)) {
      return new Response(null, { status: 401 });
    }
    if (request.method !== "POST" || new URL(request.url).pathname !== "/retire") {
      return new Response(null, { status: 404 });
    }
    const input = TargetSchema.safeParse(await request.json());
    if (!input.success) return new Response(null, { status: 400 });
    if (input.data.accountId !== env.ACCOUNT_ID || input.data.namespaceId !== env.NAMESPACE_ID) {
      return new Response(null, { status: 409 });
    }
    const id = env.TARGET.idFromString(input.data.id);
    const status = await env.TARGET.get(id).retireEmptyStorage();
    return Response.json({ status });
  },
} satisfies ExportedHandler<RetirementBindings>;
