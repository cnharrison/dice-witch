import {
  MAX_BUILTIN_APPEARANCE_STYLES_V3,
  type AppearanceProfileV3,
} from "@dice-witch/dice-v4-model";
import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppearanceApiError } from "./appearance";
import {
  getAppearanceCatalogV3,
  getAppearancePreviewV3,
  getGuildAppearanceProfileV3,
  getPersonalAppearanceBootstrapV3,
  getPersonalAppearanceProfileV3,
  parseAppearanceCatalogV3,
  parseAppearanceProfileResourceV3,
  putGuildAppearanceProfileV3,
  putPersonalAppearanceProfileV3,
} from "./appearance-v3";

const designId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";

function personalProfileV3(): AppearanceProfileV3 {
  const style = APPEARANCE_CATALOG_V3.styles[0];
  if (style === undefined) throw new Error("V3 style fixture is missing");
  return {
    version: 3,
    designs: [
      {
        id: designId,
        name: "Night garden",
        recipe: structuredClone(style.recipe),
      },
    ],
    assignments: {
      all: { source: "custom", id: designId },
      overrides: { d20: { source: "builtin", id: "hex-appeal" } },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("appearance V3 response contracts", () => {
  it("parses the complete published catalog and shared Profile V3 resources", () => {
    const catalog = parseAppearanceCatalogV3(APPEARANCE_CATALOG_V3);
    expect(catalog.version).toBe(3);
    expect(catalog.styles).toHaveLength(35);
    expect(catalog.materials).toHaveLength(10);
    expect(catalog.forms.map(({ id }) => id)).toEqual([
      "standard",
      "sharp",
      "crystal-cut",
      "hollow-cage",
      "sphere",
    ]);

    expect(
      parseAppearanceProfileResourceV3(
        { revision: 0, profile: null },
        catalog,
        false,
      ),
    ).toEqual({ revision: 0, profile: null });
    expect(
      parseAppearanceProfileResourceV3(
        { revision: 2, profile: personalProfileV3() },
        catalog,
        false,
      ),
    ).toEqual({ revision: 2, profile: personalProfileV3() });
  });

  it("rejects mixed, extra-key, incomplete, and incompatible catalog data", () => {
    const extra = structuredClone(APPEARANCE_CATALOG_V3) as unknown as Record<
      string,
      unknown
    >;
    extra.unexpected = true;
    expect(() => parseAppearanceCatalogV3(extra)).toThrow(
      "Appearance catalog V3 is invalid",
    );

    const wrongVersion = structuredClone(APPEARANCE_CATALOG_V3) as unknown as {
      version: number;
    };
    wrongVersion.version = 2;
    expect(() => parseAppearanceCatalogV3(wrongVersion)).toThrow(
      "Appearance catalog V3 is invalid",
    );

    const mixed = structuredClone(APPEARANCE_CATALOG_V3);
    Object.assign(mixed.styles[0]!.recipe, { version: 2 });
    expect(() => parseAppearanceCatalogV3(mixed)).toThrow();

    const oversized = structuredClone(APPEARANCE_CATALOG_V3);
    const firstStyle = oversized.styles[0];
    if (firstStyle === undefined) throw new Error("Style fixture is missing");
    while (oversized.styles.length <= MAX_BUILTIN_APPEARANCE_STYLES_V3) {
      oversized.styles.push(structuredClone(firstStyle));
    }
    expect(() => parseAppearanceCatalogV3(oversized)).toThrow(
      "Appearance style catalog is invalid",
    );

    const incomplete = structuredClone(APPEARANCE_CATALOG_V3);
    const classic = incomplete.materials.find(
      (material) => material.family === "classic",
    );
    if (classic?.family !== "classic") {
      throw new Error("Classic material fixture is missing");
    }
    classic.finishes.pop();
    expect(() => parseAppearanceCatalogV3(incomplete)).toThrow(
      "Appearance material catalog is invalid",
    );

    const incompatible = structuredClone(APPEARANCE_CATALOG_V3);
    const sharp = incompatible.forms.find(({ id }) => id === "sharp");
    if (sharp === undefined) throw new Error("Sharp form fixture is missing");
    sharp.targets = ["d6"];
    expect(() => parseAppearanceCatalogV3(incompatible)).toThrow(
      "Appearance form catalog is invalid",
    );
  });
});

describe("appearance V3 API client", () => {
  it("loads the immutable catalog and personal profile concurrently", async () => {
    let resolveCatalog: ((response: Response) => void) | undefined;
    const catalogResponse = new Promise<Response>((resolve) => {
      resolveCatalog = resolve;
    });
    let profileRequested = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        if (url.pathname === "/api/appearance/v3/catalog") {
          return catalogResponse;
        }
        if (url.pathname === "/api/appearance/v3/me") {
          profileRequested = true;
          return Promise.resolve(Response.json({ revision: 0, profile: null }));
        }
        return Promise.reject(new Error(`Unexpected request: ${url.pathname}`));
      }),
    );

    const bootstrap = getPersonalAppearanceBootstrapV3();
    await vi.waitFor(() => expect(profileRequested).toBe(true));
    resolveCatalog?.(Response.json(APPEARANCE_CATALOG_V3));

    await expect(bootstrap).resolves.toEqual({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 0, profile: null },
    });
  });

  it("uses exact V3 routes, build keys, revisions, and idempotency", async () => {
    const profile = personalProfileV3();
    const guildProfile = { ...profile, mode: "enforced" as const };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(APPEARANCE_CATALOG_V3))
      .mockResolvedValueOnce(Response.json({ revision: 2, profile }))
      .mockResolvedValueOnce(
        Response.json({ status: "applied", revision: 3, profile }),
      )
      .mockResolvedValueOnce(
        Response.json({ revision: 4, profile: guildProfile }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: "existing",
          revision: 4,
          profile: guildProfile,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getAppearanceCatalogV3();
    await expect(getPersonalAppearanceProfileV3(catalog)).resolves.toEqual({
      revision: 2,
      profile,
    });
    await expect(
      putPersonalAppearanceProfileV3(2, profile, catalog),
    ).resolves.toEqual({ revision: 3, profile });
    await expect(
      getGuildAppearanceProfileV3("123456789012345678", catalog),
    ).resolves.toEqual({ revision: 4, profile: guildProfile });
    await expect(
      putGuildAppearanceProfileV3(
        "123456789012345678",
        4,
        guildProfile,
        catalog,
      ),
    ).resolves.toEqual({ revision: 4, profile: guildProfile });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.com/api/appearance/v3/catalog?build=abcdef0123456789abcdef0123456789abcdef01",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.example.com/api/appearance/v3/me",
    );
    const [saveUrl, saveRequest] = fetchMock.mock.calls[2]!;
    expect(saveUrl).toBe("https://api.example.com/api/appearance/v3/me");
    const headers = new Headers(saveRequest.headers);
    expect(headers.get("idempotency-key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(JSON.parse(String(saveRequest.body))).toEqual({
      expectedRevision: 2,
      profile,
    });
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "https://api.example.com/api/guilds/123456789012345678/appearance/v3",
    );
    const [guildSaveUrl, guildSaveRequest] = fetchMock.mock.calls[4]!;
    expect(guildSaveUrl).toBe(
      "https://api.example.com/api/guilds/123456789012345678/appearance/v3",
    );
    expect(new Headers(guildSaveRequest.headers).get("idempotency-key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    await expect(
      getGuildAppearanceProfileV3("023456789012345678", catalog),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({
        status: 400,
        code: "appearance_guild_id_invalid",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("classifies unavailable and malformed Web API responses without prose matching", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("injected network failure"))
      .mockResolvedValueOnce(Response.json({ version: 3 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAppearanceCatalogV3()).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({
        status: 0,
        code: "appearance_web_api_unavailable",
      }),
    );
    await expect(getAppearanceCatalogV3()).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({
        status: 502,
        code: "appearance_catalog_response_invalid",
      }),
    );
  });

  it("parses authoritative PNG previews and preserves stable API error codes", async () => {
    const style = APPEARANCE_CATALOG_V3.styles[0];
    if (style === undefined) throw new Error("V3 style fixture is missing");
    const profile = personalProfileV3();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          version: 3,
          contentType: "image/png",
          width: 150,
          height: 150,
          base64: "iVBORw0KGgo=",
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: "appearance_profile_version_conflict" },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { status: "revision_conflict", revision: 7 },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: "appearance_data_unavailable", unexpected: true },
          { status: 503 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getAppearancePreviewV3({
        target: "d20",
        recipe: style.recipe,
        seed: 42,
        state: "critical-success",
      }),
    ).resolves.toMatchObject({ version: 3, width: 150, height: 150 });

    const catalog = parseAppearanceCatalogV3(APPEARANCE_CATALOG_V3);
    await expect(
      getPersonalAppearanceProfileV3(catalog),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({
        status: 409,
        code: "appearance_profile_version_conflict",
      }),
    );
    await expect(
      putPersonalAppearanceProfileV3(6, profile, catalog),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({
        status: 409,
        code: "appearance_revision_conflict",
      }),
    );
    await expect(
      getPersonalAppearanceProfileV3(catalog),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({
        status: 503,
        code: "appearance_http_503",
      }),
    );
  });
});
