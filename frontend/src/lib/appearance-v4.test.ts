import {
  MAX_BUILTIN_APPEARANCE_STYLES_V3,
  createDefaultDiceViewPreferencesV4,
  type AppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_CATALOG_R34_V3,
  APPEARANCE_CATALOG_V3,
} from "../../../cloudflare/packages/dice-appearance/src/catalog";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppearanceApiError } from "./appearance-api-error";
import {
  getAppearanceCatalogV4,
  getAppearancePreviewV4,
  getAppearanceThumbsVersionV4,
  getGuildAppearanceProfileV4,
  getPersonalAppearanceBootstrapV4,
  parseAppearanceCatalogV3,
  parseAppearanceProfileResourceV4,
  putGuildAppearanceProfileV4,
  putPersonalAppearanceProfileV4,
  resetPersonalAppearanceProfileV4,
  restorePersonalAppearanceProfileV4,
} from "./appearance-v4";

const designId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";

function personalProfileV4(): AppearanceProfileV4 {
  const style = APPEARANCE_CATALOG_V3.styles[0];
  if (style === undefined) throw new Error("Appearance style fixture is missing");
  return {
    version: 4,
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
    diceView: createDefaultDiceViewPreferencesV4(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("appearance V4 contracts", () => {
  it("parses the complete authoring catalog", () => {
    const catalog = parseAppearanceCatalogV3(APPEARANCE_CATALOG_V3);
    expect(catalog.version).toBe(3);
    expect(catalog.styles).toHaveLength(45);
    expect(catalog.materials).toHaveLength(12);
    expect(catalog.forms.map(({ id }) => id)).toEqual([
      "standard",
      "sharp",
      "crystal-cut",
      "hollow-cage",
      "sphere",
    ]);
    expect(parseAppearanceCatalogV3(APPEARANCE_CATALOG_R34_V3)).toEqual(
      APPEARANCE_CATALOG_R34_V3,
    );
  });

  it("rejects malformed, oversized, and incompatible catalog data", () => {
    const extra = structuredClone(APPEARANCE_CATALOG_V3) as unknown as Record<
      string,
      unknown
    >;
    extra.unexpected = true;
    expect(() => parseAppearanceCatalogV3(extra)).toThrow(
      "Appearance catalog V3 is invalid",
    );

    const oversized = structuredClone(APPEARANCE_CATALOG_V3) as {
      styles: Array<(typeof APPEARANCE_CATALOG_V3.styles)[number]>;
    };
    const firstStyle = oversized.styles[0];
    if (firstStyle === undefined) throw new Error("Style fixture is missing");
    while (oversized.styles.length <= MAX_BUILTIN_APPEARANCE_STYLES_V3) {
      oversized.styles.push(structuredClone(firstStyle));
    }
    expect(() => parseAppearanceCatalogV3(oversized)).toThrow(
      "Appearance style catalog is invalid",
    );

    const unsupportedFonts = structuredClone(APPEARANCE_CATALOG_V3);
    unsupportedFonts.fonts.push({
      id: "liberation-sans",
      name: "Liberation Sans",
    });
    expect(() => parseAppearanceCatalogV3(unsupportedFonts)).toThrow(
      "Appearance font catalog is invalid",
    );

    const incompatible = structuredClone(APPEARANCE_CATALOG_V3) as {
      forms: Array<{
        id: string;
        targets: string[];
      }>;
    };
    const sharp = incompatible.forms.find(({ id }) => id === "sharp");
    if (sharp === undefined) throw new Error("Sharp form fixture is missing");
    sharp.targets = ["d6"];
    expect(() => parseAppearanceCatalogV3(incompatible)).toThrow(
      "Appearance form catalog is invalid",
    );
  });

  it("accepts only V4 profile resources", () => {
    const catalog = parseAppearanceCatalogV3(APPEARANCE_CATALOG_V3);
    const profile = personalProfileV4();
    expect(
      parseAppearanceProfileResourceV4(
        { revision: 3, profile, canRestorePreviousMix: false },
        catalog,
        false,
      ),
    ).toEqual({ revision: 3, profile, canRestorePreviousMix: false });
    expect(() =>
      parseAppearanceProfileResourceV4(
        {
          revision: 2,
          profile: {
            version: 3,
            designs: [],
            assignments: { all: null, overrides: {} },
          },
        },
        catalog,
        false,
      ),
    ).toThrow();
  });

  it("loads the V4 catalog and personal profile concurrently", async () => {
    let resolveCatalog: ((response: Response) => void) | undefined;
    const catalogResponse = new Promise<Response>((resolve) => {
      resolveCatalog = resolve;
    });
    let profileRequested = false;
    const profile = personalProfileV4();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        if (url.pathname === "/api/appearance/v4/catalog") {
          return catalogResponse;
        }
        if (url.pathname === "/api/appearance/v4/me/state") {
          profileRequested = true;
          return Promise.resolve(
            Response.json({
              revision: 1,
              profile,
              canRestorePreviousMix: false,
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected request: ${url.pathname}`));
      }),
    );

    const bootstrap = getPersonalAppearanceBootstrapV4();
    await vi.waitFor(() => expect(profileRequested).toBe(true));
    resolveCatalog?.(Response.json(APPEARANCE_CATALOG_V3));

    await expect(bootstrap).resolves.toEqual({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 1, profile, canRestorePreviousMix: false },
    });
  });

  it("loads the thumbnail cache revision contract", async () => {
    const version = {
      version: 2,
      catalogVersion: 3,
      rendererRevision: "canvaskit-v4-r41",
      cacheRevision: 2,
    } as const;
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(version));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAppearanceThumbsVersionV4()).resolves.toEqual(version);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/appearance/thumbs/version",
      { credentials: "include" },
    );
  });

  it("rejects stale or malformed thumbnail cache contracts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          version: 1,
          catalogVersion: 3,
          rendererRevision: "canvaskit-v4-r41",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          version: 2,
          catalogVersion: 3,
          rendererRevision: "canvaskit-v4-r41",
          cacheRevision: 0,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    for (let request = 0; request < 2; request += 1) {
      await expect(getAppearanceThumbsVersionV4()).rejects.toEqual(
        expect.objectContaining<Partial<AppearanceApiError>>({
          status: 502,
          code: "appearance_thumbs_version_invalid",
        }),
      );
    }
  });

  it("uses only V4 personal and guild routes", async () => {
    const catalog = parseAppearanceCatalogV3(APPEARANCE_CATALOG_V3);
    const profile = personalProfileV4();
    const guildProfile = { ...profile, mode: "enforced" as const };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(APPEARANCE_CATALOG_V3))
      .mockResolvedValueOnce(
        Response.json({
          status: "applied",
          revision: 2,
          profile,
          canRestorePreviousMix: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          revision: 3,
          profile: guildProfile,
          canRestorePreviousMix: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: "existing",
          revision: 3,
          profile: guildProfile,
          canRestorePreviousMix: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: "applied",
          revision: 4,
          profile,
          canRestorePreviousMix: true,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: "applied",
          revision: 5,
          profile,
          canRestorePreviousMix: true,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAppearanceCatalogV4()).resolves.toEqual(APPEARANCE_CATALOG_V3);
    await expect(
      putPersonalAppearanceProfileV4(1, profile, catalog),
    ).resolves.toEqual({
      revision: 2,
      profile,
      canRestorePreviousMix: false,
    });
    await expect(
      getGuildAppearanceProfileV4("123456789012345678", catalog),
    ).resolves.toEqual({
      revision: 3,
      profile: guildProfile,
      canRestorePreviousMix: false,
    });
    await expect(
      putGuildAppearanceProfileV4(
        "123456789012345678",
        3,
        guildProfile,
        catalog,
      ),
    ).resolves.toEqual({
      revision: 3,
      profile: guildProfile,
      canRestorePreviousMix: false,
    });

    await expect(
      resetPersonalAppearanceProfileV4(3, profile, catalog),
    ).resolves.toMatchObject({ revision: 4, canRestorePreviousMix: true });
    await expect(
      restorePersonalAppearanceProfileV4(4, profile, catalog),
    ).resolves.toMatchObject({ revision: 5, canRestorePreviousMix: true });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.com/api/appearance/v4/catalog?build=abcdef0123456789abcdef0123456789abcdef01",
      "https://api.example.com/api/appearance/v4/me/state",
      "https://api.example.com/api/guilds/123456789012345678/appearance/v4/state",
      "https://api.example.com/api/guilds/123456789012345678/appearance/v4/state",
      "https://api.example.com/api/appearance/v4/me/state/reset",
      "https://api.example.com/api/appearance/v4/me/state/restore",
    ]);
    expect(fetchMock.mock.calls[4]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[5]?.[1]?.method).toBe("POST");
    const personalRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(personalRequest.headers).get("idempotency-key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(JSON.parse(String(personalRequest.body))).toEqual({
      expectedRevision: 1,
      profile,
    });
  });

  it("rejects non-V4 writes before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const catalog = parseAppearanceCatalogV3(APPEARANCE_CATALOG_V3);

    await expect(
      putPersonalAppearanceProfileV4(
        1,
        {
          version: 3,
          designs: [],
          assignments: { all: null, overrides: {} },
        } as unknown as AppearanceProfileV4,
        catalog,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({
        status: 400,
        code: "appearance_profile_invalid",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends complete camera drafts to the V4 preview route", async () => {
    const profile = personalProfileV4();
    const recipe = profile.designs[0]?.recipe;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        version: 4,
        contentType: "image/png",
        width: 150,
        height: 150,
        base64: "iVBORw0KGgo=",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(
      getAppearancePreviewV4(
        {
          target: "d20",
          recipe,
          diceView: profile.diceView,
          seed: 42,
          state: "normal",
        },
        controller.signal,
      ),
    ).resolves.toMatchObject({ version: 4, width: 150, height: 150 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.com/api/appearance/v4/preview",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("classifies unavailable and malformed responses", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("injected network failure"))
      .mockResolvedValueOnce(Response.json({ version: 3 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAppearanceCatalogV4()).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({
        status: 0,
        code: "appearance_web_api_unavailable",
      }),
    );
    await expect(getAppearanceCatalogV4()).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({
        status: 502,
        code: "appearance_catalog_response_invalid",
      }),
    );
  });
});
