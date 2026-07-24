import {
  D1RollAccountingRepository,
  parseAccountRollInput,
  type AccountRollInput,
} from "./roll-accounting-repository";
import { handleAppearanceRequest } from "./appearance-service";
import { handleMembershipRequest } from "./membership-service";
import { handleSessionRequest } from "./session-service";

export type DataEnv = {
  DATA: D1Database;
};

function isConfigured(env: DataEnv): boolean {
  const data: unknown = (env as unknown as Record<string, unknown>).DATA;
  return (
    typeof data === "object" &&
    data !== null &&
    "prepare" in data &&
    typeof data.prepare === "function"
  );
}

const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

async function accountRoll(request: Request, env: DataEnv): Promise<Response> {
  let input: AccountRollInput;
  try {
    input = parseAccountRollInput(await request.json());
  } catch {
    return Response.json(
      { error: "Roll accounting request is invalid" },
      { status: 400, headers: responseHeaders },
    );
  }
  try {
    const result = await new D1RollAccountingRepository(env.DATA).account(input);
    return Response.json(result, {
      status: result.status === "conflict" ? 409 : 200,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: "Roll accounting failed" },
      { status: 500, headers: responseHeaders },
    );
  }
}

const worker = {
  fetch(request: Request, env: DataEnv): Response | Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      if (!isConfigured(env)) {
        return Response.json(
          { error: "Data Worker is not configured" },
          { status: 503, headers: responseHeaders },
        );
      }
      return Response.json(
        { ok: true, service: "dice-witch-data" },
        { headers: responseHeaders },
      );
    }
    if (
      request.method === "POST" &&
      url.pathname === "/internal/roll-accounting"
    ) {
      return accountRoll(request, env);
    }
    const appearanceResponse = handleAppearanceRequest(request, env.DATA);
    if (appearanceResponse !== null) return appearanceResponse;
    const sessionResponse = handleSessionRequest(request, env.DATA);
    if (sessionResponse !== null) return sessionResponse;
    const membershipResponse = handleMembershipRequest(request, env.DATA);
    if (membershipResponse !== null) return membershipResponse;
    return Response.json(
      { error: "Not found" },
      {
        status: 404,
        headers: responseHeaders,
      },
    );
  },
} satisfies ExportedHandler<DataEnv>;

export default worker;
