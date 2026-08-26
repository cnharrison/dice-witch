import { describe, expect, it, vi } from "vitest";
import { routeInteractionRequest } from "../../workers/web-api/src/index";

function unexpectedConnect(): never {
  throw new Error("Unexpected socket connection");
}

describe("same-origin interaction ingress", () => {
  it("forwards the exact interaction path without consuming its signed body", async () => {
    const interactionFetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST");
      expect(new URL(request.url).pathname).toBe("/interactions");
      expect(request.headers.get("x-signature-ed25519")).toBe("signature");
      expect(request.headers.get("x-signature-timestamp")).toBe("timestamp");
      expect(await request.text()).toBe('{"type":1}');
      return Response.json({ type: 1 });
    });
    const request = new Request("https://example.com/interactions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": "signature",
        "x-signature-timestamp": "timestamp",
      },
      body: '{"type":1}',
    });

    const response = routeInteractionRequest(request, {
      fetch: interactionFetch,
      connect: unexpectedConnect,
    });

    await expect(response).resolves.toMatchObject({ status: 200 });
    expect(interactionFetch).toHaveBeenCalledOnce();
  });

  it("does not forward lookalike or ordinary web/API paths", () => {
    const interactionFetch = vi.fn();
    const interactions = {
      fetch: interactionFetch,
      connect: unexpectedConnect,
    };

    expect(
      routeInteractionRequest(
        new Request("https://example.com/interactions/other"),
        interactions,
      ),
    ).toBeNull();
    expect(
      routeInteractionRequest(
        new Request("https://example.com/api/auth/session"),
        interactions,
      ),
    ).toBeNull();
    expect(interactionFetch).not.toHaveBeenCalled();
  });
});
