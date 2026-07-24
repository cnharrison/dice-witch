import { D1AudienceSnapshotRepository } from "./audience-snapshot-repository";

const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: responseHeaders });
}

async function readAudienceSnapshot(db: D1Database): Promise<Response> {
  try {
    const snapshot = await new D1AudienceSnapshotRepository(db).read();
    return Response.json(
      snapshot === null
        ? { status: "missing" }
        : { status: "found", snapshot },
      { headers: responseHeaders },
    );
  } catch {
    return errorResponse("Audience snapshot lookup failed", 500);
  }
}

async function storeAudienceSnapshot(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return errorResponse("Audience snapshot request is invalid", 400);
  }
  try {
    const result = await new D1AudienceSnapshotRepository(db).store(value);
    return Response.json(result, {
      status:
        result.status === "stale" || result.status === "conflict" ? 409 : 200,
      headers: responseHeaders,
    });
  } catch (error) {
    const invalid =
      error instanceof Error &&
      error.message === "Discord audience capture is invalid";
    return errorResponse(
      invalid
        ? "Audience snapshot request is invalid"
        : "Audience snapshot update failed",
      invalid ? 400 : 500,
    );
  }
}

export function handleAudienceSnapshotRequest(
  request: Request,
  db: D1Database,
): Response | Promise<Response> | null {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/internal/audience-snapshot") return null;
  if (request.method === "GET") return readAudienceSnapshot(db);
  if (request.method === "POST") return storeAudienceSnapshot(request, db);
  return new Response(null, {
    status: 405,
    headers: { ...responseHeaders, allow: "GET, POST" },
  });
}
