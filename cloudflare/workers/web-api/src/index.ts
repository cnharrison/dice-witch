import { handleAuthRequest, type WebApiBindings } from "./auth";

export type BuildMetadataBindings = {
  ENVIRONMENT: string;
  BUILD_SHA: string;
  BUILD_TIME: string;
};

export type WebApiWorkerBindings = WebApiBindings &
  BuildMetadataBindings & {
    INTERACTIONS_SERVICE: Fetcher;
  };

const FULL_SHA = /^[0-9a-f]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function routeMetadataRequest(
  request: Request,
  env: BuildMetadataBindings,
): Response | null {
  if (new URL(request.url).pathname !== "/api/meta") return null;
  if (request.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { allow: "GET", "cache-control": "no-store" } },
    );
  }
  if (
    (env.ENVIRONMENT !== "staging" && env.ENVIRONMENT !== "production") ||
    !FULL_SHA.test(env.BUILD_SHA) ||
    !ISO_TIMESTAMP.test(env.BUILD_TIME) ||
    Number.isNaN(Date.parse(env.BUILD_TIME))
  ) {
    return Response.json(
      { error: "Build metadata is unavailable" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    {
      environment: env.ENVIRONMENT,
      build: { sha: env.BUILD_SHA, time: env.BUILD_TIME },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export function routeInteractionRequest(
  request: Request,
  interactions: Fetcher,
): Promise<Response> | null {
  return new URL(request.url).pathname === "/interactions"
    ? interactions.fetch(request)
    : null;
}

export default {
  fetch(
    request: Request,
    env: WebApiWorkerBindings,
  ): Response | Promise<Response> {
    return (
      routeMetadataRequest(request, env) ??
      routeInteractionRequest(request, env.INTERACTIONS_SERVICE) ??
      handleAuthRequest(request, env)
    );
  },
} satisfies ExportedHandler<WebApiWorkerBindings>;
