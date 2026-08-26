import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { APPEARANCE_THUMB_CACHE_REVISION_V3 } from "../../packages/dice-appearance/src";
import {
  appearanceThumbsVersion,
  bakeAppearanceThumbs,
  serveAppearanceThumb,
  type AppearanceThumbsEnv,
} from "../../workers/web-api/src/appearance-thumbs-api";

const BakeResponseSchema = z.strictObject({
  version: z.literal(2),
  catalogVersion: z.number(),
  rendererRevision: z.string(),
  cacheRevision: z.literal(APPEARANCE_THUMB_CACHE_REVISION_V3),
  baked: z.number(),
  skipped: z.number(),
  total: z.number(),
});
const VersionResponseSchema = BakeResponseSchema.pick({
  version: true,
  catalogVersion: true,
  rendererRevision: true,
  cacheRevision: true,
});

type BakeRequestBody = {
  ids: string[] | string;
  force?: boolean;
};
type ThumbEnvOverrides = {
  ROLL_WEB?: Partial<AppearanceThumbsEnv["ROLL_WEB"]>;
};

function thumbEnv(overrides: ThumbEnvOverrides = {}) {
  const objects = new Map<string, Uint8Array>();
  return {
    ROLL_WEB: {
      previewV4: vi.fn(() =>
        Promise.resolve({
          version: 4,
          contentType: "image/png",
          width: 256,
          height: 256,
          diceCount: 1,
          rowCount: 1,
          png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
        }),
      ),
      previewRendererRevisionV4: vi.fn(() =>
        Promise.resolve("canvaskit-v4-r41"),
      ),
      ...overrides.ROLL_WEB,
    },
    THUMBS: {
      get: vi.fn((key: string) =>
        Promise.resolve(
          objects.has(key) ? { body: new ReadableStream<Uint8Array>() } : null,
        ),
      ),
      put: vi.fn((key: string, value: Uint8Array) => {
        objects.set(key, value);
        return Promise.resolve(undefined);
      }),
      head: vi.fn((key: string) =>
        Promise.resolve(objects.has(key) ? {} : null)
      ),
    },
    APPEARANCE_CATALOG_POLICY: "r37",
    APPEARANCE_THUMBS_BAKE_SECRET: "secret-value",
  } satisfies AppearanceThumbsEnv;
}

function bakeRequest(
  body?: BakeRequestBody,
  secret: string | null = "secret-value",
): Request {
  const init: RequestInit = {
    method: "POST",
    headers:
      secret === null
        ? { "content-type": "application/json" }
        : {
            "content-type": "application/json",
            "x-appearance-thumbs-bake-secret": secret,
          },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(
    "https://web-api.internal/api/internal/appearance/thumbs",
    init,
  );
}

describe("bakeAppearanceThumbs", () => {
  it("rejects requests without a valid secret", async () => {
    const env = thumbEnv();
    expect(
      (await bakeAppearanceThumbs(bakeRequest(undefined, null), env)).status,
    ).toBe(403);
    expect(
      (await bakeAppearanceThumbs(bakeRequest(undefined, "wrong"), env)).status,
    ).toBe(403);
  });

  it("bakes a requested tile into a versioned bucket key", async () => {
    const env = thumbEnv();
    const response = await bakeAppearanceThumbs(
      bakeRequest({ ids: ["material/glass"] }),
      env,
    );
    expect(response.status).toBe(200);
    const result = BakeResponseSchema.parse(await response.json());
    expect(result).toMatchObject({
      version: 2,
      cacheRevision: 4,
      baked: 1,
      skipped: 0,
      total: 1,
    });
    expect(env.THUMBS.put).toHaveBeenCalledWith(
      "thumbs/3-canvaskit-v4-r41/material/glass.png",
      expect.any(Uint8Array),
      { httpMetadata: { contentType: "image/png" } },
    );
  });

  it("skips tiles that already exist unless force is set", async () => {
    const env = thumbEnv();
    await bakeAppearanceThumbs(bakeRequest({ ids: ["material/glass"] }), env);
    const skipped = await bakeAppearanceThumbs(
      bakeRequest({ ids: ["material/glass"] }),
      env,
    );
    expect(BakeResponseSchema.parse(await skipped.json())).toMatchObject({
      baked: 0,
      skipped: 1,
    });
    env.THUMBS.head.mockClear();
    const forced = await bakeAppearanceThumbs(
      bakeRequest({ ids: ["material/glass"], force: true }),
      env,
    );
    expect(BakeResponseSchema.parse(await forced.json())).toMatchObject({
      baked: 1,
    });
  });

  it("fails loudly when the renderer returns a non-PNG result", async () => {
    const env = thumbEnv({
      ROLL_WEB: {
        ...thumbEnv().ROLL_WEB,
        previewV4: vi.fn(() => Promise.resolve({ png: "not-bytes" })),
      },
    });
    const response = await bakeAppearanceThumbs(
      bakeRequest({ ids: ["ink/matte-ink"] }),
      env,
    );
    expect(response.status).toBe(502);
  });

  it("rejects an invalid bake input", async () => {
    const env = thumbEnv();
    expect(
      (await bakeAppearanceThumbs(bakeRequest({ ids: "glass" }), env)).status,
    ).toBe(400);
  });
});

describe("serveAppearanceThumb", () => {
  it("serves stored tiles as immutable PNGs", async () => {
    const env = thumbEnv();
    await bakeAppearanceThumbs(bakeRequest({ ids: ["font/fraunces"] }), env);
    const response = await serveAppearanceThumb(
      "/thumbs/3-canvaskit-v4-r41/font/fraunces.png",
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("returns 404 for missing tiles and malformed paths", async () => {
    const env = thumbEnv();
    expect(
      (await serveAppearanceThumb("/thumbs/3-canvaskit-v4-r41/font/none.png", env))
        .status,
    ).toBe(404);
    expect((await serveAppearanceThumb("/thumbs/nope", env)).status).toBe(404);
  });
});

describe("appearanceThumbsVersion", () => {
  it("reports the catalog version and renderer revision thumbs are keyed by", async () => {
    const env = thumbEnv();
    const response = await appearanceThumbsVersion(env);
    expect(response.status).toBe(200);
    expect(VersionResponseSchema.parse(await response.json())).toEqual({
      version: 2,
      catalogVersion: 3,
      rendererRevision: "canvaskit-v4-r41",
      cacheRevision: 4,
    });
  });

  it("fails when the renderer reports an unknown revision", async () => {
    const env = thumbEnv({
      ROLL_WEB: {
        previewRendererRevisionV4: vi.fn(() =>
          Promise.resolve("canvaskit-v4-r999"),
        ),
      },
    });
    expect((await appearanceThumbsVersion(env)).status).toBe(502);
  });
});
