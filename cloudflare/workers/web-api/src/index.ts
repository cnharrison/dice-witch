import { handleAuthRequest, type WebApiBindings } from "./auth";

export type WebApiWorkerBindings = WebApiBindings & {
  INTERACTIONS_SERVICE: Fetcher;
};

export function routeInteractionRequest(
  request: Request,
  interactions: Fetcher,
): Promise<Response> | null {
  return new URL(request.url).pathname === "/interactions"
    ? interactions.fetch(request)
    : null;
}

export default {
  fetch(request: Request, env: WebApiWorkerBindings): Promise<Response> {
    return (
      routeInteractionRequest(request, env.INTERACTIONS_SERVICE) ??
      handleAuthRequest(request, env)
    );
  },
} satisfies ExportedHandler<WebApiWorkerBindings>;
