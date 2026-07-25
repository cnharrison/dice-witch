import {
  APPEARANCE_TARGETS_V4,
  type AppearanceRecipeV3,
} from "@dice-witch/dice-v4-model";
import type {
  DiceRequestRendererFactoryV4,
  RenderedDiceRequestV4,
} from "../../packages/dice-canvaskit/src";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_TARGETS,
  BUILTIN_APPEARANCE_STYLES_V3,
} from "../../packages/dice-appearance/src";
import {
  buildAppearancePreviewRenderRequest,
  buildAppearancePreviewRenderRequestV3,
  buildAppearancePreviewRenderRequestV4,
  executeWebRoll,
  prepareWebRoll,
  renderAppearancePreview,
  renderAppearancePreviewV2,
  renderAppearancePreviewV3,
} from "../../workers/roll/src/web-roll-service";

const userId = "100000000000000003";
const guildId = "100000000000000002";
const recipe = {
  version: 1,
  variation: "fixed",
  varyBy: "roll",
  colors: { mode: "tonal", primary: "#123456" },
  fill: { mode: "fixed", value: { type: "gradient" } },
  font: { mode: "fixed", fontId: "liberation-sans" },
};

const recipeV2 = {
  ...recipe,
  version: 2,
  compatibility: "native-v2",
  gradient: {
    colorSource: "full-palette",
    scope: { mode: "fixed", value: "die-wide" },
    direction: { mode: "fixed", value: "upper-left-to-lower-right" },
  },
  lighting: {
    mode: { mode: "fixed", value: "combined" },
    strength: { mode: "fixed", value: "subtle" },
    direction: { mode: "fixed", value: "upper-left" },
  },
};

const recipeV3 = BUILTIN_APPEARANCE_STYLES_V3[0]?.recipe;
const provenanceRecipeV3 = BUILTIN_APPEARANCE_STYLES_V3.find(
  ({ id }) => id === "hollow-victory",
)?.recipe;
if (recipeV3 === undefined || provenanceRecipeV3 === undefined) {
  throw new Error("V3 recipe fixture is missing");
}
const defaultRecipeV3: AppearanceRecipeV3 = recipeV3;
const materialProvenanceRecipeV3: AppearanceRecipeV3 = provenanceRecipeV3;

function appearanceService(
  onRequest?: (value: unknown, path: string) => void,
  activeRecipe: AppearanceRecipeV3 = defaultRecipeV3,
) {
  return {
    async fetch(request: Request): Promise<Response> {
      const value: unknown = await request.json();
      onRequest?.(value, new URL(request.url).pathname);
      const version = new URL(request.url).pathname.includes("/v3/") ? 3 : 2;
      return Response.json({
        version,
        recipes: Object.fromEntries(
          (version === 3 ? APPEARANCE_TARGETS_V4 : APPEARANCE_TARGETS).map(
            (target) => [target, version === 3 ? activeRecipe : recipeV2],
          ),
        ),
      });
    },
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    notation: "1d20",
    repetitions: 1,
    username: "fixture-user",
    title: null,
    userId,
    guildId,
    renderSeed: 0x51ce_b00c,
    appearanceDigest: "0".repeat(64),
    ...overrides,
  };
}

async function preparedRequest(
  dataService: ReturnType<typeof appearanceService>,
  version: "3" | "4",
  overrides: Record<string, unknown> = {},
) {
  const value = request(overrides);
  const preparation = await prepareWebRoll(
    {
      notation: value.notation,
      repetitions: value.repetitions,
      userId,
      guildId,
      renderSeed: value.renderSeed,
    },
    dataService,
    version,
  );
  if (preparation.status !== "prepared") {
    throw new Error("Expected a prepared request fixture");
  }
  return {
    ...value,
    renderSeed: preparation.renderSeed,
    appearanceDigest: preparation.appearanceDigest,
  };
}

describe("appearance preview", () => {
  it("builds critical previews through the renderer-v2 contract", () => {
    const preview = buildAppearancePreviewRenderRequest({
      target: "d20",
      recipe,
      seed: 0x1234_5678,
      state: "critical-success",
    });

    expect(preview).toMatchObject({
      version: 2,
      groups: [
        [
          {
            target: "d20",
            result: 20,
            appearance: {
              primaryColor: "#123456",
              effect: "critical-success",
            },
            icons: ["critical-success"],
          },
        ],
      ],
    });
  });

  it("covers every physical representation in the all-dice preview", () => {
    const preview = buildAppearancePreviewRenderRequest({
      target: "all",
      recipe,
      seed: 7,
      state: "normal",
    });
    const dice = preview.groups.flat();

    expect(preview.groups.map((group) => group.length)).toEqual([5, 5]);
    expect(dice).toHaveLength(10);
    expect(dice.map(({ target }) => target)).toEqual([
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d20",
      "percentile",
      "d10",
      "fudge",
      "other",
    ]);
  });

  it("preserves both colors from a two-color palette across preview surfaces", () => {
    const palette = {
      ...recipeV2,
      variation: "fixed",
      colors: { mode: "palette", colors: ["#ff0000", "#0000ff"] },
    };
    const surface = (fill: unknown) =>
      buildAppearancePreviewRenderRequestV3({
        target: "d20",
        recipe: { ...palette, fill: { mode: "fixed", value: fill } },
        seed: 7,
        state: "normal",
      }).groups[0]?.[0]?.appearance.surface;

    expect(surface({ type: "solid" })).toEqual({
      type: "solid",
      color: "#ff0000",
    });
    expect(surface({ type: "gradient" })).toMatchObject({
      type: "gradient",
      colors: ["#ff0000", "#0000ff"],
    });
    expect(surface({ type: "pattern", patternId: "checkerboard" })).toEqual({
      type: "pattern",
      pattern: "checkerboard-v2",
      primaryColor: "#ff0000",
      secondaryColor: "#0000ff",
    });
  });

  it("uses the same 5-by-2 all-dice layout for native V3 previews", async () => {
    const preview = buildAppearancePreviewRenderRequestV3({
      target: "all",
      recipe: recipeV2,
      seed: 7,
      state: "normal",
    });

    expect(preview.groups.map((group) => group.length)).toEqual([5, 5]);
    expect(preview.groups.flat()).toHaveLength(10);
    const rendered = await renderAppearancePreviewV2({
      target: "all",
      recipe: recipeV2,
      seed: 7,
      state: "normal",
    });
    expect(rendered).toMatchObject({ width: 750, height: 300 });
  });

  it("builds authoritative r7 snapshots for Profile V3 previews", () => {
    const preview = buildAppearancePreviewRenderRequestV4({
      target: "all",
      recipe: recipeV3,
      seed: 7,
      state: "normal",
    });

    expect(preview).toMatchObject({
      version: 4,
      rendererRevision: "canvaskit-v4-r8",
    });
    expect(preview.groups.map((group) => group.length)).toEqual([5, 5]);
    expect(preview.groups.flat()).toHaveLength(10);
    expect(
      new Set(
        preview.groups.flat().map(({ appearance }) => appearance.texture.scope),
      ),
    ).toEqual(new Set(["die-wide"]));
  });

  it("retries one identical V4 preview and returns a bounded renderer result", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    let attempts = 0;
    let disposals = 0;
    const createRenderer: DiceRequestRendererFactoryV4 = () => ({
      renderValidated(request): Promise<RenderedDiceRequestV4> {
        attempts += 1;
        if (attempts === 1) {
          return Promise.reject(new Error("injected preview failure"));
        }
        return Promise.resolve({
          rendererRevision: request.rendererRevision,
          png,
          width: 150,
          height: 150,
          visibleFaceCount: 5,
          diceCount: 1,
          rowCount: 1,
        });
      },
      dispose(): void {
        disposals += 1;
      },
    });

    const rendered = await renderAppearancePreviewV3(
      {
        target: "d20",
        recipe: recipeV3,
        seed: 0x1234_5678,
        state: "normal",
      },
      createRenderer,
    );

    expect(rendered).toEqual({
      version: 4,
      contentType: "image/png",
      width: 150,
      height: 150,
      diceCount: 1,
      rowCount: 1,
      png,
    });
    expect(attempts).toBe(2);
    expect(disposals).toBe(2);
  });

  it("renders deterministic Profile V3 previews through the real V4 renderer", async () => {
    const input = {
      target: "d20",
      recipe: recipeV3,
      seed: 0x0bad_f00d,
      state: "normal",
    } as const;

    const first = await renderAppearancePreviewV3(input);
    const second = await renderAppearancePreviewV3(input);

    expect(first).toMatchObject({
      version: 4,
      contentType: "image/png",
      width: 150,
      height: 150,
      diceCount: 1,
      rowCount: 1,
    });
    expect(first.png.slice(0, 8)).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(second.png).toEqual(first.png);

    const allDice = await renderAppearancePreviewV3({
      ...input,
      target: "all",
    });
    expect(allDice).toMatchObject({
      version: 4,
      contentType: "image/png",
      width: 750,
      height: 300,
      diceCount: 10,
      rowCount: 2,
    });
  });

  it("renders byte-identical preview PNGs for the same seed", async () => {
    const request = {
      target: "fudge",
      recipe,
      seed: 42,
      state: "critical-failure",
    };

    const first = await renderAppearancePreview(request);
    const second = await renderAppearancePreview(request);
    expect(second).toEqual(first);
    expect(first.contentType).toBe("image/png");
    expect(first.png.byteLength).toBeGreaterThan(0);
  });

  it("builds and renders deterministic V2 profile previews through renderer V3", async () => {
    const request = {
      target: "d20",
      recipe: recipeV2,
      seed: 0x1234_5678,
      state: "critical-success",
    };
    const preview = buildAppearancePreviewRenderRequestV3(request);
    expect(preview).toMatchObject({
      version: 3,
      groups: [
        [
          {
            target: "d20",
            result: 20,
            appearance: {
              surface: { type: "gradient", scope: "die-wide" },
              lighting: { mode: "combined", strength: "subtle" },
              effect: "critical-success",
            },
            icons: ["critical-success"],
          },
        ],
      ],
    });

    const first = await renderAppearancePreviewV2(request);
    const second = await renderAppearancePreviewV2(request);
    expect(second).toEqual(first);
    expect(first.version).toBe(3);
    expect(first.png.byteLength).toBeGreaterThan(0);
  });

  it("rejects unsupported preview fields and assets", () => {
    expect(() =>
      buildAppearancePreviewRenderRequest({
        target: "d20",
        recipe,
        seed: 1,
        state: "normal",
        remoteTextureUrl: "https://example.com/texture.svg",
      }),
    ).toThrow("Appearance preview request is invalid");
  });
});

describe("WebRollService", () => {
  it("prepares and rolls the same stable V4 physical appearance", async () => {
    const dataService = appearanceService();
    const preparation = await prepareWebRoll(
      {
        notation: "2d20",
        repetitions: 1,
        userId,
        guildId,
      },
      dataService,
      "4",
    );
    expect(preparation.status).toBe("prepared");
    if (preparation.status !== "prepared") {
      throw new Error("Expected a prepared roll");
    }
    expect(preparation.groupSizes).toEqual([2]);
    expect(preparation.appearanceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(preparation.appearanceIdentities).toEqual([
      [
        "expression:0:repeat:0:definition:20:0:die:0",
        "expression:0:repeat:0:definition:20:0:die:1",
      ],
    ]);
    expect(preparation.renderedImage.png.slice(0, 8)).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(preparation.renderModel?.groups[0]?.every((die) => die.icons.length === 0)).toBe(true);
    const expandedPreparation = await prepareWebRoll(
      {
        notation: "3d20",
        repetitions: 1,
        userId,
        guildId,
        renderSeed: preparation.renderSeed,
      },
      dataService,
      "4",
    );
    if (
      expandedPreparation.status !== "prepared" ||
      preparation.renderModel === undefined ||
      expandedPreparation.renderModel === undefined
    ) {
      throw new Error("Expected stable V4 preparations");
    }
    expect(
      expandedPreparation.renderModel.groups[0]
        ?.slice(0, 2)
        .map(({ appearance }) => appearance),
    ).toEqual(
      preparation.renderModel.groups[0]?.map(({ appearance }) => appearance),
    );

    const result = await executeWebRoll(
      request({
        notation: "2d20",
        renderSeed: preparation.renderSeed,
        appearanceDigest: preparation.appearanceDigest,
      }),
      dataService,
      "4",
    );
    expect(result.status).toBe("rolled");
    if (result.status !== "rolled" || result.renderModel === undefined) {
      throw new Error("Expected V4 preparation and result models");
    }
    expect(
      result.renderModel.groups[0]?.map(({ appearance, form, target }) => ({
        appearance: { ...appearance, effect: null },
        form,
        target,
      })),
    ).toEqual(
      preparation.renderModel.groups[0]?.map(({ appearance, form, target }) => ({
        appearance,
        form,
        target,
      })),
    );
  });

  it("keeps the Preferences-resolved material on original and exploded dice", async () => {
    const dataService = appearanceService(
      undefined,
      materialProvenanceRecipeV3,
    );
    const notation = "10d6!";
    const preparation = await prepareWebRoll(
      {
        notation,
        repetitions: 1,
        userId,
        guildId,
        renderSeed: 0x51ce_b00c,
      },
      dataService,
      "4",
    );
    if (preparation.status !== "prepared") {
      throw new Error("Expected an exploding-dice preparation");
    }

    const result = await executeWebRoll(
      request({
        notation,
        renderSeed: preparation.renderSeed,
        appearanceDigest: preparation.appearanceDigest,
      }),
      dataService,
      "4",
      () => 0,
    );
    if (result.status !== "rolled" || result.renderModel === undefined) {
      throw new Error("Expected an exploding-dice result");
    }
    const generated = result.appearanceIdentities
      .flat()
      .filter((identity) => identity.includes(":generated:"));
    expect(generated).toEqual([
      "expression:0:repeat:0:definition:6:0:die:5:generated:0",
      "expression:0:repeat:0:definition:6:0:die:6:generated:0",
    ]);
    expect(preparation.renderModel?.groups.flat()).toHaveLength(10);
    expect(result.renderModel.groups.flat()).toHaveLength(12);
    for (const die of [
      ...(preparation.renderModel?.groups.flat() ?? []),
      ...result.renderModel.groups.flat(),
    ]) {
      expect(die.appearance).toMatchObject({
        material: { family: "metal", metal: "brass", finish: "polished" },
        palette: ["#d49a20", "#e7b640", "#ffe080"],
      });
    }
  });

  it.each(["10d6r=1", "10d6ro=1"])(
    "reports actual %s rerolls and preserves their Preferences appearance",
    async (notation) => {
      const dataService = appearanceService(
        undefined,
        materialProvenanceRecipeV3,
      );
      const preparation = await prepareWebRoll(
        {
          notation,
          repetitions: 1,
          userId,
          guildId,
          renderSeed: 0x51ce_b00c,
        },
        dataService,
        "4",
      );
      if (preparation.status !== "prepared") {
        throw new Error("Expected a reroll preparation");
      }
      const result = await executeWebRoll(
        request({
          notation,
          renderSeed: preparation.renderSeed,
          appearanceDigest: preparation.appearanceDigest,
        }),
        dataService,
        "4",
        () => 0,
      );
      if (result.status !== "rolled" || result.renderModel === undefined) {
        throw new Error("Expected a reroll result");
      }

      const identities = new Set(result.appearanceIdentities.flat());
      expect(result.rerolledAppearanceIdentities.length).toBeGreaterThan(0);
      expect(
        result.rerolledAppearanceIdentities.every((identity) =>
          identities.has(identity),
        ),
      ).toBe(true);
      result.renderModel.groups.flat().forEach((die) => {
        expect(die.appearance).toMatchObject({
          material: { family: "metal", metal: "brass", finish: "polished" },
          palette: ["#d49a20", "#e7b640", "#ffe080"],
        });
      });
      const rerolled = new Set(result.rerolledAppearanceIdentities);
      const rerolledDice = result.renderModel.groups.flatMap((group, groupIndex) =>
        group.filter((_die, dieIndex) =>
          rerolled.has(result.appearanceIdentities[groupIndex]?.[dieIndex] ?? ""),
        ),
      );
      expect(rerolledDice).not.toHaveLength(0);
      expect(rerolledDice.every(({ icons }) => icons.includes("recycle"))).toBe(
        true,
      );
    },
  );

  it.each(["5d%r<50", "5d%ro<=100"])(
    "marks both physical percentile dice for logical %s rerolls",
    async (notation) => {
      const dataService = appearanceService();
      const preparation = await prepareWebRoll(
        {
          notation,
          repetitions: 1,
          userId,
          guildId,
          renderSeed: 0x51ce_b00c,
        },
        dataService,
        "4",
      );
      if (preparation.status !== "prepared") {
        throw new Error("Expected a percentile reroll preparation");
      }

      const result = await executeWebRoll(
        request({
          notation,
          renderSeed: preparation.renderSeed,
          appearanceDigest: preparation.appearanceDigest,
        }),
        dataService,
        "4",
        () => 0,
      );
      if (result.status !== "rolled") {
        throw new Error("Expected a percentile reroll result");
      }

      const rerolled = new Set(result.rerolledAppearanceIdentities);
      expect(rerolled.size).toBeGreaterThan(0);
      expect(rerolled.size % 2).toBe(0);
      for (const identity of rerolled) {
        const [suffix, pairedSuffix] = identity.endsWith(":percentile")
          ? [":percentile", ":ones"]
          : [":ones", ":percentile"];
        expect(identity).toMatch(/:(?:percentile|ones)$/);
        expect(
          rerolled.has(`${identity.slice(0, -suffix.length)}${pairedSuffix}`),
        ).toBe(true);
      }
    },
  );

  it("accepts the legacy Web API execute contract during the rollout window", async () => {
    const legacyRequest = {
      notation: "1d20",
      repetitions: 1,
      username: "fixture-user",
      title: null,
      userId,
      guildId,
    };
    const result = await executeWebRoll(
      legacyRequest,
      appearanceService(),
      "3",
      () => 0x1234_5678,
    );

    expect(result.status).toBe("rolled");
    if (result.status !== "rolled") throw new Error("Expected a rolled result");
    expect(result).not.toHaveProperty("renderModel");
    expect(result.diceArray[0]?.[0]).toMatchObject({
      sides: 20,
      color: "#123456",
    });
  });

  it("executes staging rolls once and uses one exact renderer-v4 PNG for web and Discord", async () => {
    const lookups: Array<{ path: string; value: unknown }> = [];
    const dataService = appearanceService((value, path) =>
      lookups.push({ path, value }),
    );
    const value = await preparedRequest(dataService, "4");
    lookups.length = 0;
    const result = await executeWebRoll(value, dataService, "4");

    expect(result.status).toBe("rolled");
    if (result.status !== "rolled") throw new Error("Expected a rolled result");
    expect(lookups).toEqual([
      {
        path: "/internal/appearance/v3/effective",
        value: { userId, guildId },
      },
    ]);
    expect(result.diceArray).toHaveLength(1);
    expect(result.rerolledAppearanceIdentities).toEqual([]);
    expect(result.diceArray[0]).toHaveLength(1);
    expect(result.diceArray[0]?.[0]).toMatchObject({ sides: 20 });
    expect(result.diceArray[0]?.[0]?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.resultArray).toHaveLength(1);
    expect(result.resultArray[0]?.results).toBeGreaterThanOrEqual(1);
    expect(result.resultArray[0]?.results).toBeLessThanOrEqual(20);
    expect(result.discord.filename).toBe("dice-witch-roll.png");
    expect(result.renderedImage.contentType).toBe("image/png");
    expect(result.renderedImage.width).toBeGreaterThan(0);
    expect(result.renderedImage.height).toBeGreaterThan(0);
    expect(result.renderedImage.png).toEqual(result.discord.png);
    expect(result.renderModel).toMatchObject({
      version: 4,
      rendererRevision: "canvaskit-v4-r8",
    });
    if (result.renderModel === undefined) {
      throw new Error("Expected a V4 render model");
    }
    expect(result.renderModel.groups.flat()).toHaveLength(1);
    expect(result.renderModel.groups[0]?.[0]?.result).toBe(
      result.diceArray[0]?.[0]?.rolled,
    );
    expect(result.discord.png.slice(0, 8)).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });

  it("retains explicit renderer-v3 emission for production compatibility", async () => {
    const lookups: string[] = [];
    const dataService = appearanceService((_value, path) => lookups.push(path));
    const value = await preparedRequest(dataService, "3");
    lookups.length = 0;
    const result = await executeWebRoll(value, dataService, "3");

    expect(result.status).toBe("rolled");
    if (result.status !== "rolled") throw new Error("Expected a rolled result");
    expect(lookups).toEqual(["/internal/appearance/v2/effective"]);
    expect(result.diceArray[0]?.[0]).toMatchObject({
      sides: 20,
      color: "#123456",
    });
    expect(result).not.toHaveProperty("renderModel");
  });

  it("rejects a roll when its prepared appearance changes", async () => {
    const replacementRecipe = BUILTIN_APPEARANCE_STYLES_V3[1]?.recipe;
    if (replacementRecipe === undefined) {
      throw new Error("Replacement V3 recipe fixture is missing");
    }
    let activeRecipe = recipeV3;
    const dataService = {
      fetch(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname;
        if (path !== "/internal/appearance/v3/effective") {
          throw new Error("Unexpected appearance route");
        }
        return Promise.resolve(
          Response.json({
            version: 3,
            recipes: Object.fromEntries(
              APPEARANCE_TARGETS_V4.map((target) => [target, activeRecipe]),
            ),
          }),
        );
      },
    };
    const prepared = await prepareWebRoll(
      { notation: "1d20", repetitions: 1, userId, guildId },
      dataService,
      "4",
    );
    if (prepared.status !== "prepared") {
      throw new Error("Expected a prepared roll");
    }
    activeRecipe = replacementRecipe;

    await expect(
      executeWebRoll(
        request({
          renderSeed: prepared.renderSeed,
          appearanceDigest: prepared.appearanceDigest,
        }),
        dataService,
        "4",
      ),
    ).resolves.toEqual({
      status: "stale",
      message: "Prepared appearance has changed; prepare the roll again",
    });
  });

  it("returns a user-facing error without loading appearance for invalid notation", async () => {
    await expect(
      executeWebRoll(
        request({ notation: "definitely-not-dice" }),
        {
          fetch(): Promise<Response> {
            throw new Error("Appearance must not be loaded");
          },
        },
        "4",
      ),
    ).resolves.toEqual({
      status: "invalid",
      message: "🚫🎲 Invalid dice notation!",
    });
  });

  it("rejects malformed request shapes", async () => {
    await expect(
      executeWebRoll(
        request({ channelId: "must-not-cross-roll-boundary" }),
        appearanceService(),
        "4",
      ),
    ).rejects.toThrow("Web roll request is invalid");
  });

  it("fails instead of substituting an appearance when Data is unavailable", async () => {
    await expect(
      executeWebRoll(
        request(),
        {
          fetch(): Promise<Response> {
            return Promise.resolve(
              Response.json({ error: "temporary" }, { status: 503 }),
            );
          },
        },
        "4",
      ),
    ).rejects.toThrow("Effective appearance lookup failed");
  });
});
