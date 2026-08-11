import {
  APPEARANCE_CATALOG_V1,
  APPEARANCE_CATALOG_V2,
  FEATURED_APPEARANCE_PATTERN_IDS as BACKEND_FEATURED_PATTERN_IDS,
  FEATURED_APPEARANCE_STYLE_IDS as BACKEND_FEATURED_STYLE_IDS,
} from "../../../cloudflare/packages/dice-appearance/src/catalog";
import type {
  AppearanceProfileV2,
  GuildAppearanceProfileV2,
} from "@/types/appearance";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppearanceApiError,
  getAppearanceCatalog,
  getAppearancePreview,
  parseAppearanceCatalog,
  parseAppearanceProfileResource,
  putAppearanceProfile,
} from "./appearance";
import {
  createNativeAppearanceTreatment,
  FEATURED_APPEARANCE_PATTERN_IDS,
  FEATURED_APPEARANCE_STYLE_IDS,
} from "./appearance-editor";

const CUSTOM_DESIGN_ID = "123e4567-e89b-42d3-a456-426614174000";

function personalProfile(): AppearanceProfileV2 {
  return {
    version: 2,
    designs: [
      {
        id: CUSTOM_DESIGN_ID,
        name: "Night garden",
        recipe: structuredClone(APPEARANCE_CATALOG_V2.styles[0]!.recipe),
      },
    ],
    assignments: {
      all: { source: "custom", id: CUSTOM_DESIGN_ID },
      overrides: {
        d20: { source: "builtin", id: "chaotic" },
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("appearance response contracts", () => {
  it("accepts the published backend catalog", () => {
    const catalog = parseAppearanceCatalog(APPEARANCE_CATALOG_V2);

    expect(catalog.version).toBe(2);
    expect(catalog.defaultStyleId).toBe("chaotic");
    expect(catalog.styles).toHaveLength(29);
    expect(catalog.patterns).toHaveLength(10);
    expect(catalog.fonts).toHaveLength(8);
    expect(FEATURED_APPEARANCE_STYLE_IDS).toEqual(
      BACKEND_FEATURED_STYLE_IDS.filter(
        (id) => id !== "solid" && id !== "rainbow",
      ),
    );
    expect(FEATURED_APPEARANCE_PATTERN_IDS).toEqual(
      BACKEND_FEATURED_PATTERN_IDS,
    );
  });

  it("keys catalog requests by the frontend build SHA", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(APPEARANCE_CATALOG_V2), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getAppearanceCatalog();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/appearance/v2/catalog?build=abcdef0123456789abcdef0123456789abcdef01",
      { credentials: "include" },
    );
  });

  it("rejects V1 and mixed catalogs instead of migrating in the browser", () => {
    expect(() => parseAppearanceCatalog(APPEARANCE_CATALOG_V1)).toThrow(
      "Appearance catalog is invalid",
    );
    const mixed = structuredClone(APPEARANCE_CATALOG_V2) as unknown as {
      styles: Array<{ recipe: { version: number } }>;
    };
    mixed.styles[0]!.recipe.version = 1;
    expect(() => parseAppearanceCatalog(mixed)).toThrow(
      "Appearance recipe is invalid",
    );
  });

  it("rejects invalid or mixed V2 treatment selections", () => {
    const duplicate = structuredClone(APPEARANCE_CATALOG_V2) as unknown as {
      styles: Array<{
        recipe: {
          gradient: { scope: unknown };
        };
      }>;
    };
    duplicate.styles[0]!.recipe.gradient.scope = {
      mode: "allowlist",
      values: ["repeated", "repeated"],
    };
    expect(() => parseAppearanceCatalog(duplicate)).toThrow(
      "Appearance treatment values are not unique",
    );

    const mixed = structuredClone(APPEARANCE_CATALOG_V2) as unknown as {
      styles: Array<{
        recipe: {
          lighting: Record<string, unknown>;
        };
      }>;
    };
    mixed.styles[0]!.recipe.lighting.unexpected = true;
    expect(() => parseAppearanceCatalog(mixed)).toThrow(
      "Appearance recipe is invalid",
    );
  });

  it("parses native random pairs and repeated palette stops without widening legacy recipes", () => {
    const randomPair = structuredClone(APPEARANCE_CATALOG_V2) as unknown as {
      styles: Array<{ recipe: { colors: unknown } }>;
    };
    randomPair.styles[0]!.recipe.colors = { mode: "random-pair" };
    expect(parseAppearanceCatalog(randomPair).styles[0]?.recipe.colors).toEqual({
      mode: "random-pair",
    });

    const repeatedPalette = structuredClone(APPEARANCE_CATALOG_V2) as unknown as {
      styles: Array<{ recipe: { colors: unknown } }>;
    };
    repeatedPalette.styles[0]!.recipe.colors = {
      mode: "palette",
      colors: ["#5bcffa", "#f5abb9", "#ffffff", "#f5abb9", "#5bcffa"],
    };
    expect(
      parseAppearanceCatalog(repeatedPalette).styles[0]?.recipe.colors,
    ).toMatchObject({
      mode: "palette",
      colors: ["#5bcffa", "#f5abb9", "#ffffff", "#f5abb9", "#5bcffa"],
    });

    const legacyRandomPair = structuredClone(randomPair) as {
      styles: Array<{
        recipe: {
          compatibility: string;
          colors: unknown;
          gradient: unknown;
          lighting: unknown;
        };
      }>;
    };
    const recipe = legacyRandomPair.styles[0]!.recipe;
    recipe.compatibility = "legacy-v1";
    recipe.gradient = {
      colorSource: "resolved-pair",
      scope: { mode: "fixed", value: "repeated" },
      direction: { mode: "fixed", value: "top-to-bottom" },
    };
    recipe.lighting = {
      mode: { mode: "fixed", value: "facet" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    };
    expect(() => parseAppearanceCatalog(legacyRandomPair)).toThrow(
      "Legacy appearance colors are invalid",
    );
  });

  it("enforces treatment and weighted selection bounds", () => {
    const empty = structuredClone(APPEARANCE_CATALOG_V2);
    empty.styles[0]!.recipe.gradient.direction = {
      mode: "allowlist",
      values: [],
    };
    expect(() => parseAppearanceCatalog(empty)).toThrow(
      "Appearance treatment selection is invalid",
    );

    const maximum = structuredClone(APPEARANCE_CATALOG_V2);
    maximum.styles[0]!.recipe.gradient.direction = {
      mode: "allowlist",
      values: [
        "top-to-bottom",
        "upper-right-to-lower-left",
        "right-to-left",
        "lower-right-to-upper-left",
        "bottom-to-top",
        "lower-left-to-upper-right",
        "left-to-right",
        "upper-left-to-lower-right",
      ],
    };
    expect(() => parseAppearanceCatalog(maximum)).not.toThrow();

    const excessive = structuredClone(maximum);
    if (excessive.styles[0]!.recipe.gradient.direction.mode !== "allowlist") {
      throw new Error("Direction fixture is invalid");
    }
    excessive.styles[0]!.recipe.gradient.direction.values.push(
      "top-to-bottom",
    );
    expect(() => parseAppearanceCatalog(excessive)).toThrow(
      "Appearance treatment selection is invalid",
    );

    const overweight = structuredClone(APPEARANCE_CATALOG_V2);
    overweight.styles[0]!.recipe.lighting.mode = {
      mode: "weighted",
      options: [{ value: "combined", weight: 1_001 }],
    };
    expect(() => parseAppearanceCatalog(overweight)).toThrow(
      "Appearance selection weight is invalid",
    );

    const excessiveTotal = structuredClone(APPEARANCE_CATALOG_V2);
    excessiveTotal.styles[0]!.recipe.fill = {
      mode: "weighted",
      options: [
        { value: { type: "solid" }, weight: 1_000 },
        { value: { type: "gradient" }, weight: 1_000 },
        ...excessiveTotal.patterns.map(({ id }) => ({
          value: { type: "pattern" as const, patternId: id },
          weight: 1_000,
        })),
      ],
    };
    expect(() => parseAppearanceCatalog(excessiveTotal)).toThrow(
      "Appearance selection weights are invalid",
    );
  });

  it("uses approved native treatment defaults for new drafts", () => {
    expect(createNativeAppearanceTreatment()).toEqual({
      compatibility: "native-v2",
      gradient: {
        colorSource: "full-palette",
        scope: { mode: "fixed", value: "die-wide" },
        direction: {
          mode: "fixed",
          value: "upper-left-to-lower-right",
        },
      },
      lighting: {
        mode: { mode: "fixed", value: "combined" },
        strength: { mode: "fixed", value: "gentle" },
        direction: { mode: "fixed", value: "upper-left" },
      },
    });
  });

  it("rejects oversized option catalogs", () => {
    const malformed = structuredClone(APPEARANCE_CATALOG_V2) as unknown as {
      fonts: Array<{ id: string; name: string }>;
    };
    malformed.fonts = Array.from({ length: 17 }, (_, index) => ({
      id: `font-${String(index)}`,
      name: `Font ${String(index)}`,
    }));

    expect(() => parseAppearanceCatalog(malformed)).toThrow(
      "Appearance fonts are invalid",
    );
  });

  it("parses missing and versioned personal profiles", () => {
    const catalog = parseAppearanceCatalog(APPEARANCE_CATALOG_V2);

    expect(
      parseAppearanceProfileResource(
        { revision: 0, profile: null },
        catalog,
        false,
      ),
    ).toEqual({ revision: 0, profile: null });
    expect(
      parseAppearanceProfileResource<AppearanceProfileV2>(
        { revision: 3, profile: personalProfile() },
        catalog,
        false,
      ),
    ).toEqual({ revision: 3, profile: personalProfile() });
    expect(() =>
      parseAppearanceProfileResource(
        {
          revision: 3,
          profile: { ...personalProfile(), version: 1 },
        },
        catalog,
        false,
      ),
    ).toThrow("Appearance profile is invalid");
  });

  it("rejects dangling references and canonicalizes stored values", () => {
    const catalog = parseAppearanceCatalog(APPEARANCE_CATALOG_V2);
    const dangling = personalProfile();
    dangling.assignments.all = {
      source: "custom",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    expect(() =>
      parseAppearanceProfileResource(
        { revision: 1, profile: dangling },
        catalog,
        false,
      ),
    ).toThrow("Appearance custom design is missing");

    const padded = personalProfile();
    padded.designs[0]!.name = " Night garden ";
    const paddedResource = parseAppearanceProfileResource(
      { revision: 1, profile: padded },
      catalog,
      false,
    );
    expect(paddedResource.profile?.designs[0]?.name).toBe("Night garden");

    const uppercase = personalProfile();
    uppercase.designs[0]!.recipe.colors = {
      mode: "palette",
      colors: ["#ABCDEF", "#123456"],
    };
    const canonical = parseAppearanceProfileResource(
      { revision: 1, profile: uppercase },
      catalog,
      false,
    );
    expect(canonical.profile?.designs[0]?.recipe.colors).toEqual({
      mode: "palette",
      colors: ["#abcdef", "#123456"],
    });
  });

  it("requires guild mode only for guild profiles", () => {
    const catalog = parseAppearanceCatalog(APPEARANCE_CATALOG_V2);
    const guildProfile: GuildAppearanceProfileV2 = {
      ...personalProfile(),
      mode: "enforced",
    };

    expect(
      parseAppearanceProfileResource<GuildAppearanceProfileV2>(
        { revision: 2, profile: guildProfile },
        catalog,
        true,
      ).profile,
    ).toEqual(guildProfile);
    expect(() =>
      parseAppearanceProfileResource(
        { revision: 2, profile: guildProfile },
        catalog,
        false,
      ),
    ).toThrow("Appearance profile is invalid");
  });
});

describe("appearance API client", () => {
  it("requests and validates a PNG preview", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        version: 2,
        contentType: "image/png",
        width: 150,
        height: 150,
        base64: "iVBORw0KGgo=",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const preview = await getAppearancePreview({
      target: "d20",
      recipe: structuredClone(APPEARANCE_CATALOG_V2.styles[0]!.recipe),
      seed: 42,
      state: "critical-success",
    });

    expect(preview.width).toBe(150);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/api/appearance/v2/preview");
    expect(request.credentials).toBe("include");
    expect(JSON.parse(String(request.body))).toMatchObject({
      target: "d20",
      seed: 42,
      state: "critical-success",
    });
  });

  it("sends optimistic revisions and idempotency keys", async () => {
    const profile = personalProfile();
    const fetchMock = vi.fn(async () =>
      Response.json({ status: "applied", revision: 5, profile }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const catalog = parseAppearanceCatalog(APPEARANCE_CATALOG_V2);

    const result = await putAppearanceProfile(
      "/api/appearance/v2/me",
      4,
      profile,
      catalog,
      false,
    );

    expect(result.revision).toBe(5);
    const [, request] = fetchMock.mock.calls[0]!;
    const headers = new Headers(request.headers);
    expect(headers.get("idempotency-key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(JSON.parse(String(request.body))).toEqual({
      expectedRevision: 4,
      profile,
    });
  });

  it("surfaces revision conflicts without accepting their body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { status: "revision_conflict", revision: 7 },
          { status: 409 },
        ),
      ),
    );
    const catalog = parseAppearanceCatalog(APPEARANCE_CATALOG_V2);

    await expect(
      putAppearanceProfile(
        "/api/appearance/v2/me",
        6,
        personalProfile(),
        catalog,
        false,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppearanceApiError>>({ status: 409 }),
    );
  });
});
