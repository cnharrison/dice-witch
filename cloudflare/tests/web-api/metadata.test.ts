import { describe, expect, it } from "vitest";
import { routeMetadataRequest } from "../../workers/web-api/src/index";

const metadata = {
  ENVIRONMENT: "staging",
  BUILD_SHA: "a".repeat(40),
  BUILD_TIME: "2026-07-15T19:28:57.000Z",
};

describe("web API build metadata", () => {
  it("returns exact no-store staging metadata", async () => {
    const response = routeMetadataRequest(
      new Request("https://staging.example.com/api/meta"),
      metadata,
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    await expect(response?.json()).resolves.toEqual({
      environment: "staging",
      build: {
        sha: "a".repeat(40),
        time: "2026-07-15T19:28:57.000Z",
      },
    });
  });

  it("does not claim invalid metadata", async () => {
    const response = routeMetadataRequest(
      new Request("https://staging.example.com/api/meta"),
      { ...metadata, BUILD_SHA: "short" },
    );

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({
      error: "Build metadata is unavailable",
    });
  });

  it("rejects mutation methods and ignores unrelated routes", () => {
    const mutation = routeMetadataRequest(
      new Request("https://staging.example.com/api/meta", { method: "POST" }),
      metadata,
    );

    expect(mutation?.status).toBe(405);
    expect(mutation?.headers.get("allow")).toBe("GET");
    expect(
      routeMetadataRequest(
        new Request("https://staging.example.com/api/stats"),
        metadata,
      ),
    ).toBeNull();
  });
});
