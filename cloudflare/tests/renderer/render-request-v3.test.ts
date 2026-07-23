import { describe, expect, it } from "vitest";
import {
  APPEARANCE_TARGETS,
  legacyAppearanceRecipeV1,
  migrateAppearanceRecipeV1,
  type AppearanceFill,
  type AppearanceRecipeV1,
} from "../../packages/dice-appearance/src";
import {
  APPEARANCE_FONT_IDS,
  composeBlankDiceSvgV3,
  composeDiceSvgV3,
  renderDiceRequestV2ToPng,
  renderDiceRequestV3ToPng,
  validateRenderRequestV2,
  validateRenderRequestV3,
  type RenderAppearanceV3,
  type RenderDieV3,
  type RenderRequestV3,
} from "../../packages/dice-svg/src";
import {
  buildRollRenderRequestV2,
  buildRollRenderRequestV3,
  type EffectiveAppearanceRecipes,
  type EffectiveAppearanceRecipesV2,
} from "../../packages/roll-render-model/src";
import type { RollExecutionResult } from "../../packages/roll-domain/src";

const appearance: RenderAppearanceV3 = {
  surface: {
    type: "gradient",
    colors: ["#5426a8", "#c93ee8", "#f2d95c"],
    scope: "die-wide",
    direction: "upper-left-to-lower-right",
  },
  lighting: {
    mode: "combined",
    strength: "subtle",
    direction: "upper-left",
  },
  textColor: "#111111",
  outlineColor: "#000000",
  fontId: "liberation-sans",
  effect: null,
  requiresLocalSeparation: false,
};

function allTargetsRequest(): RenderRequestV3 {
  return {
    version: 3,
    groups: [
      [
        { target: "d4", result: 4, appearance, icons: [] },
        { target: "d6", result: 6, appearance, icons: [] },
        { target: "d8", result: 8, appearance, icons: [] },
        { target: "d10", result: 0, appearance, icons: [] },
        { target: "d12", result: 12, appearance, icons: [] },
        { target: "d20", result: 20, appearance, icons: [] },
      ],
      [
        { target: "percentile", result: 90, appearance, icons: [] },
        { target: "fudge", result: -1, appearance, icons: [] },
        { target: "other", sides: 999, result: 999, appearance, icons: [] },
      ],
    ],
  };
}

function d20(overrides: Partial<RenderDieV3> = {}): RenderDieV3 {
  return {
    target: "d20",
    result: 20,
    appearance,
    icons: [],
    ...overrides,
  } as RenderDieV3;
}

function requestWithAppearance(value: unknown): unknown {
  return {
    version: 3,
    groups: [[{ ...d20(), appearance: value }]],
  };
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
}

function targetSvg(svg: string, target: string, index = 0): string {
  const matches = [
    ...svg.matchAll(
      new RegExp(
        `<svg\\b[^>]*data-render-target="${target}"[^>]*>([\\s\\S]*?)<\\/svg>`,
        "g",
      ),
    ),
  ];
  const content = matches[index]?.[1];
  if (content === undefined) {
    throw new Error(`Rendered ${target} target ${String(index)} is missing`);
  }
  return content;
}

const compatibilityRoll: RollExecutionResult = {
  version: 1,
  seed: 0,
  outcomes: [
    {
      notation: "compatibility-fixture",
      output: "compatibility-fixture",
      total: 1_150,
      dice: [
        { sides: 4, rolled: 4, modifiers: [] },
        { sides: 6, rolled: 6, modifiers: [] },
        { sides: 8, rolled: 8, modifiers: [] },
        { sides: 10, rolled: 10, modifiers: [] },
        { sides: 12, rolled: 12, modifiers: [] },
        { sides: 20, rolled: 20, modifiers: [] },
        { sides: "%", rolled: 90, modifiers: [] },
        { sides: "F", rolled: 1, modifiers: [] },
        { sides: 999, rolled: 999, modifiers: [] },
      ],
    },
  ],
  errors: [],
};

function compatibilityRecipe(
  fill: AppearanceFill,
  colors: AppearanceRecipeV1["colors"] = {
    mode: "palette",
    colors: ["#5426a8", "#c93ee8"],
  },
): AppearanceRecipeV1 {
  return {
    version: 1,
    variation: "fixed",
    varyBy: "die",
    colors,
    fill: { mode: "fixed", value: fill },
    font: { mode: "fixed", fontId: "liberation-sans" },
  };
}

function compatibilityRecipes(
  recipe: AppearanceRecipeV1,
): EffectiveAppearanceRecipes {
  return Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, recipe]),
  );
}

function migratedCompatibilityRecipes(
  recipe: AppearanceRecipeV1,
): EffectiveAppearanceRecipesV2 {
  const migrated = migrateAppearanceRecipeV1(recipe);
  return Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, migrated]),
  );
}

describe("RenderRequestV3", () => {
  it("strictly validates every target and canonicalizes colors", () => {
    const request = allTargetsRequest();
    const everyTarget = validateRenderRequestV3(request);
    expect(
      everyTarget.groups.flatMap((group) =>
        group.map(({ target }) => target),
      ),
    ).toEqual([
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d20",
      "percentile",
      "fudge",
      "other",
    ]);

    const first = request.groups[0]?.[0];
    if (first === undefined) throw new Error("Fixture die is missing");
    const parsed = validateRenderRequestV3({
      ...request,
      groups: [[
        {
          ...first,
          appearance: {
            ...appearance,
            surface: {
              type: "gradient",
              colors: ["#ABCDEF", "#ABCDEF", "#123456"],
              scope: "repeated",
              direction: "right-to-left",
            },
            textColor: "#FAF9F6",
            outlineColor: "#000000",
          },
        },
      ], ...request.groups.slice(1)],
    });

    expect(parsed.version).toBe(3);
    expect(parsed.groups[0]?.[0]?.appearance).toMatchObject({
      surface: {
        colors: ["#abcdef", "#abcdef", "#123456"],
      },
      textColor: "#faf9f6",
    });
  });

  it("keeps legacy d10 snapshots separate from the original-guided target", () => {
    const legacy = composeDiceSvgV3({
      version: 3,
      groups: [[{ target: "d10", result: 10, appearance, icons: [] }]],
    }).svg;
    const originalGuided = composeDiceSvgV3({
      version: 3,
      groups: [[
        {
          target: "d10-original",
          result: 10,
          appearance,
          icons: [],
        },
      ]],
    }).svg;

    expect(legacy).toContain('data-render-target="d10"');
    expect(legacy).toContain(
      "translate(150 240) rotate(-42) scale(0.78 1)",
    );
    expect(originalGuided).toContain('data-render-target="d10-original"');
    expect(originalGuided).toContain(
      "matrix(0.416 0.435 -0.582 0.712 143 227)",
    );
  });

  it("accepts exact solid, pattern, and lighting discriminants", () => {
    const parsed = validateRenderRequestV3({
      version: 3,
      groups: [[
        d20({
          appearance: {
            ...appearance,
            surface: { type: "solid", color: "#101820" },
            lighting: { mode: "none" },
          },
        }),
        d20({
          appearance: {
            ...appearance,
            surface: {
              type: "pattern",
              pattern: "checkerboard",
              primaryColor: "#101820",
              secondaryColor: "#f2aa4c",
            },
            lighting: { mode: "facet", strength: "strong" },
          },
        }),
        d20({
          appearance: {
            ...appearance,
            lighting: {
              mode: "directional",
              strength: "subtle",
              direction: "right",
            },
          },
        }),
      ]],
    });

    expect(parsed.groups[0]?.map(({ appearance: value }) => value.lighting.mode)).toEqual([
      "none",
      "facet",
      "directional",
    ]);
  });

  it("creates an additive blank-face composition without changing authoritative V3", () => {
    const request = allTargetsRequest();
    const numbered = composeDiceSvgV3(request);
    const blank = composeBlankDiceSvgV3(request);

    expect(numbered.svg).toContain("engraving-text");
    expect(blank.svg).not.toContain('class="engraving-text');
    expect(blank.svg).not.toContain('class="engraving-mark-ink');
    expect(blank).toMatchObject({
      width: numbered.width,
      height: numbered.height,
      diceCount: numbered.diceCount,
      rowCount: numbered.rowCount,
    });
  });

  it("dispatches every V3 target through one composed grid", () => {
    const composed = composeDiceSvgV3(allTargetsRequest());

    expect(composed.diceCount).toBe(9);
    expect(composed.rowCount).toBe(2);
    expect(composed.width).toBe(900);
    expect(composed.height).toBe(300);
    const expectedDice = [
      ["d4", "translate(300 406)", 3],
      ["d6", "translate(270 346)", 3],
      ["d8", "matrix(1 0 0 1 300 302)", 4],
      ["d10", "translate(298 251)", 5],
      ["d12", "translate(298 316)", 6],
      ["d20", "translate(303 326)", 10],
      ["percentile", "translate(300 250)", 5],
      ["fudge", "translate(270 337)", 3],
    ] as const;
    for (const [target, geometryMarker, faceCount] of expectedDice) {
      const nested = targetSvg(composed.svg, target);
      expect(nested).toContain(geometryMarker);
      expect(nested.match(/data-face-value=/g)).toHaveLength(faceCount);
    }
    const other = targetSvg(composed.svg, "other");
    expect(other).toContain('data-sides-label="true"');
    expect(other).toContain('data-face-value="999"');
    expect(other).toContain(">d999</text>");
  });

  it("namespaces V3 material and directional definitions per die", () => {
    const die = d20();
    const composed = composeDiceSvgV3({
      version: 3,
      groups: [[die, die]],
    }).svg;
    const materialId =
      "appearance-gradient-v3_die-wide_upper-left-to-lower-right_5426a8_c93ee8_f2d95c";
    const directionalId =
      "appearance-directional-light-v3_subtle_upper-left";

    for (const index of [0, 1]) {
      expect(composed).toContain(`id="dw-die-${String(index)}-${materialId}"`);
      expect(composed).toContain(
        `fill="url(#dw-die-${String(index)}-${materialId})"`,
      );
      expect(composed).toContain(
        `id="dw-die-${String(index)}-${directionalId}"`,
      );
      expect(composed).toContain(
        `fill="url(#dw-die-${String(index)}-${directionalId})"`,
      );
    }
    expect(composed).not.toContain(`fill="url(#${materialId})"`);
    expect(composed).not.toContain(`fill="url(#${directionalId})"`);
  });

  it("forwards V3 icons into the shared grid layout", () => {
    const iconDie = d20({
      appearance: { ...appearance, effect: "critical-success" },
      icons: ["critical-success", "explosion", "recycle"],
    });
    const composed = composeDiceSvgV3({
      version: 3,
      groups: [[iconDie]],
    });

    expect(composed.width).toBe(150);
    expect(composed.height).toBe(187);
    expect(composed.diceCount).toBe(1);
    expect(composed.svg).toContain('data-render-target="d20"');
    expect(
      composed.svg.match(/ y="150" width="37" height="37"/g),
    ).toHaveLength(3);
  });

  it("keeps every heterogeneous local reference namespaced and resolvable", () => {
    const request = allTargetsRequest();
    const firstGroup = request.groups[0];
    const first = firstGroup?.[0];
    if (firstGroup === undefined || first === undefined) {
      throw new Error("Fixture die is missing");
    }
    request.groups[0] = [
      {
        ...first,
        appearance: {
          ...first.appearance,
          surface: {
            type: "pattern",
            pattern: "checkerboard",
            primaryColor: "#5426a8",
            secondaryColor: "#c93ee8",
          },
          effect: "critical-success",
        },
        icons: ["critical-success"],
      },
      ...firstGroup.slice(1),
    ];
    const svg = composeDiceSvgV3(request).svg;
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );
    const references = [
      ...svg.matchAll(/url\(#([^)]+)\)/g),
      ...svg.matchAll(/(?:xlink:href|href)="#([^"]+)"/g),
    ].map((match) => match[1] ?? "");
    const idSet = new Set(ids);

    expect(idSet.size).toBe(ids.length);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(idSet.has(reference)).toBe(true);
    }
    expect(svg).toContain("pattern_checkerboard_5426a8_c93ee8");
    expect(svg).toContain("critical-glow");
  });

  it("applies persisted local separation across every V3 target", () => {
    const request = allTargetsRequest();
    const separated: RenderRequestV3 = {
      ...request,
      groups: request.groups.map((group) =>
        group.map((die) => ({
          ...die,
          appearance: {
            ...die.appearance,
            requiresLocalSeparation: true,
          },
        })),
      ),
    };

    expect(
      composeDiceSvgV3(separated).svg.match(/data-local-separation=/g),
    ).toHaveLength(40);
  });

  it("rasterizes V3 with embedded fonts into RenderResultV3", async () => {
    const rendered = await renderDiceRequestV3ToPng(allTargetsRequest());

    expect(rendered.version).toBe(3);
    expect(rendered.diceCount).toBe(9);
    expect(rendered.rowCount).toBe(2);
    expect(rendered.width).toBe(900);
    expect(rendered.height).toBe(300);
    expect(hasPngSignature(rendered.png)).toBe(true);
  });

  it("rejects invalid input through both V3 execution entry points", async () => {
    const invalid = { version: 2, groups: allTargetsRequest().groups };

    expect(() => composeDiceSvgV3(invalid)).toThrow(
      "Render request version must be 3",
    );
    await expect(renderDiceRequestV3ToPng(invalid)).rejects.toThrow(
      "Render request version must be 3",
    );
  });

  it("accepts every bounded gradient and directional-lighting enum", () => {
    const directions = [
      "top-to-bottom",
      "upper-right-to-lower-left",
      "right-to-left",
      "lower-right-to-upper-left",
      "bottom-to-top",
      "lower-left-to-upper-right",
      "left-to-right",
      "upper-left-to-lower-right",
    ] as const;
    for (const scope of ["repeated", "die-wide"] as const) {
      for (const direction of directions) {
        expect(() =>
          validateRenderRequestV3(
            requestWithAppearance({
              ...appearance,
              surface: {
                type: "gradient",
                colors: ["#000000", "#ffffff"],
                scope,
                direction,
              },
            }),
          ),
        ).not.toThrow();
      }
    }

    for (const mode of ["directional", "combined"] as const) {
      for (const strength of ["gentle", "subtle", "strong"] as const) {
        for (const direction of [
          "top",
          "upper-left",
          "upper-right",
          "left",
          "right",
        ] as const) {
          expect(() =>
            validateRenderRequestV3(
              requestWithAppearance({
                ...appearance,
                lighting: { mode, strength, direction },
              }),
            ),
          ).not.toThrow();
        }
      }
    }
  });

  it("accepts every bounded asset and exact collection maximum", () => {
    const patterns = [
      "checkerboard",
      "dots",
      "stripes",
      "stars",
      "zigzag",
      "triangles",
      "honeycomb",
      "circuit",
      "crosshatch",
      "swirl",
      "checkerboard-v2",
      "dots-v2",
      "stripes-v2",
      "triangles-v2",
      "crosshatch-v2",
    ] as const;
    for (const pattern of patterns) {
      expect(() =>
        validateRenderRequestV3(
          requestWithAppearance({
            ...appearance,
            surface: {
              type: "pattern",
              pattern,
              primaryColor: "#000000",
              secondaryColor: "#ffffff",
            },
          }),
        ),
      ).not.toThrow();
    }
    for (const fontId of APPEARANCE_FONT_IDS) {
      expect(() =>
        validateRenderRequestV3(
          requestWithAppearance({ ...appearance, fontId }),
        ),
      ).not.toThrow();
    }
    for (const effect of [
      null,
      "critical-success",
      "critical-failure",
    ] as const) {
      expect(() =>
        validateRenderRequestV3(
          requestWithAppearance({ ...appearance, effect }),
        ),
      ).not.toThrow();
    }

    const icons = [
      "trashcan",
      "explosion",
      "recycle",
      "chevronUp",
      "chevronDown",
      "target-success",
      "critical-success",
      "critical-failure",
      "penetrate",
      "unique",
      "blank",
    ] as const;
    for (const icon of icons) {
      expect(() =>
        validateRenderRequestV3({
          version: 3,
          groups: [[{ ...d20(), icons: [icon] }]],
        }),
      ).not.toThrow();
    }
    expect(() =>
      validateRenderRequestV3({
        version: 3,
        groups: [[
          {
            ...d20(),
            icons: ["critical-success", "explosion", "recycle"],
          },
        ]],
      }),
    ).not.toThrow();
    expect(() =>
      validateRenderRequestV3({
        version: 3,
        groups: [
          Array.from({ length: 25 }, () => d20()),
          Array.from({ length: 25 }, () => d20()),
        ],
      }),
    ).not.toThrow();
    expect(() =>
      validateRenderRequestV3(
        requestWithAppearance({
          ...appearance,
          surface: {
            type: "gradient",
            colors: [
              "#000000",
              "#111111",
              "#222222",
              "#333333",
              "#444444",
              "#555555",
            ],
            scope: "die-wide",
            direction: "bottom-to-top",
          },
        }),
      ),
    ).not.toThrow();
  });

  it("accepts every target result boundary", () => {
    const minimums = [
      { target: "d4", result: 1, appearance, icons: [] },
      { target: "d6", result: 1, appearance, icons: [] },
      { target: "d8", result: 1, appearance, icons: [] },
      { target: "d10", result: 0, appearance, icons: [] },
      { target: "d12", result: 1, appearance, icons: [] },
      { target: "d20", result: 1, appearance, icons: [] },
      { target: "percentile", result: 0, appearance, icons: [] },
      { target: "fudge", result: 1, appearance, icons: [] },
      {
        target: "other",
        sides: 1,
        result: 1,
        appearance,
        icons: [],
      },
    ];
    expect(() =>
      validateRenderRequestV3({ version: 3, groups: [minimums] }),
    ).not.toThrow();
    expect(() => validateRenderRequestV3(allTargetsRequest())).not.toThrow();
  });

  it("bounds gradient stops while preserving valid duplicate colors", () => {
    const valid = {
      ...appearance,
      surface: {
        type: "gradient",
        colors: ["#123456", "#123456"],
        scope: "repeated",
        direction: "top-to-bottom",
      },
    };
    expect(validateRenderRequestV3(requestWithAppearance(valid))).toMatchObject({
      groups: [[{ appearance: { surface: { colors: ["#123456", "#123456"] } } }]],
    });

    for (const colors of [
      ["#123456"],
      [
        "#000000",
        "#111111",
        "#222222",
        "#333333",
        "#444444",
        "#555555",
        "#666666",
      ],
    ]) {
      expect(() =>
        validateRenderRequestV3(
          requestWithAppearance({
            ...valid,
            surface: { ...valid.surface, colors },
          }),
        ),
      ).toThrow(
        "Render request groups[0][0].appearance.surface.colors must contain from two through six colors",
      );
    }
  });

  it("rejects invalid material fields, enums, colors, and assets", () => {
    expect(() =>
      validateRenderRequestV3(
        requestWithAppearance({
          ...appearance,
          surface: { type: "solid", color: "red" },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.surface.color must be a six-digit hex color",
    );
    for (const pattern of ["missing", "checkerboard-projected-v1"]) {
      expect(() =>
        validateRenderRequestV3(
          requestWithAppearance({
            ...appearance,
            surface: {
              type: "pattern",
              pattern,
              primaryColor: "#000000",
              secondaryColor: "#ffffff",
            },
          }),
        ),
      ).toThrow("Render request groups[0][0].appearance.surface is invalid");
    }
    for (const invalidTreatment of [
      { scope: "facet" },
      { direction: "clockwise" },
    ]) {
      expect(() =>
        validateRenderRequestV3(
          requestWithAppearance({
            ...appearance,
            surface: { ...appearance.surface, ...invalidTreatment },
          }),
        ),
      ).toThrow("Render request groups[0][0].appearance.surface is invalid");
    }
    expect(() =>
      validateRenderRequestV3(
        requestWithAppearance({
          ...appearance,
          fontId: "missing-font",
        }),
      ),
    ).toThrow("Render request groups[0][0].appearance.fontId is not supported");
  });

  it("rejects inactive or missing lighting fields", () => {
    for (const lighting of [
      { mode: "none", strength: "subtle" },
      { mode: "facet", strength: "subtle", direction: "left" },
      { mode: "directional", strength: "subtle" },
      { mode: "combined", strength: "extreme", direction: "left" },
      { mode: "combined", strength: "strong", direction: "lower-left" },
    ]) {
      expect(() =>
        validateRenderRequestV3(
          requestWithAppearance({ ...appearance, lighting }),
        ),
      ).toThrow("Render request groups[0][0].appearance.lighting is invalid");
    }
  });

  it("restricts ink, borders, effects, and exact appearance fields", () => {
    for (const value of [
      { ...appearance, textColor: "#ffffff" },
      { ...appearance, outlineColor: "#ffffff" },
      { ...appearance, effect: "glow" },
      { ...appearance, requiresLocalSeparation: "yes" },
      { ...appearance, presetId: "chaotic" },
    ]) {
      expect(() =>
        validateRenderRequestV3(requestWithAppearance(value)),
      ).toThrow();
    }
  });

  it("bounds groups, dice, icons, targets, results, and Other sides", () => {
    expect(() => validateRenderRequestV3({ version: 3, groups: [] })).toThrow(
      "Render request groups must be a non-empty array",
    );
    expect(() =>
      validateRenderRequestV3({ version: 3, groups: [[]] }),
    ).toThrow("Render request groups[0] must be a non-empty array");
    expect(() =>
      validateRenderRequestV3({
        version: 3,
        groups: [[d20()]],
        presetId: "chaotic",
      }),
    ).toThrow("Render request V3 has invalid fields");
    expect(() =>
      validateRenderRequestV3({
        version: 3,
        groups: [[...Array.from({ length: 51 }, () => d20())]],
      }),
    ).toThrow("Render request exceeds 50 dice");
    expect(() =>
      validateRenderRequestV3({
        version: 3,
        groups: [[d20({ icons: ["blank", "blank", "blank", "blank"] })]],
      }),
    ).toThrow("Render request groups[0][0].icons must contain at most three icons");
    expect(() =>
      validateRenderRequestV3({
        version: 3,
        groups: [[{ ...d20(), icons: ["missing"] }]],
      }),
    ).toThrow("Render request groups[0][0].icons[0] is not supported");

    const invalidResults: Array<[Record<string, unknown>, string]> = [
      [
        { ...d20(), target: "d4", result: 5 },
        "Render request groups[0][0].result must be from 1 through 4",
      ],
      [
        { ...d20(), target: "d6", result: 7 },
        "Render request groups[0][0].result must be from 1 through 6",
      ],
      [
        { ...d20(), target: "d8", result: 9 },
        "Render request groups[0][0].result must be from 1 through 8",
      ],
      [
        { ...d20(), target: "d10", result: 11 },
        "Render request groups[0][0].result must be from 0 through 10",
      ],
      [
        { ...d20(), target: "d12", result: 13 },
        "Render request groups[0][0].result must be from 1 through 12",
      ],
      [
        { ...d20(), target: "d20", result: 21 },
        "Render request groups[0][0].result must be from 1 through 20",
      ],
      [
        { ...d20(), target: "percentile", result: 95 },
        "Render request groups[0][0].result must be a multiple of 10 from 0 through 90",
      ],
      [
        { ...d20(), target: "fudge", result: 2 },
        "Render request groups[0][0].result must be -1, 0, or 1",
      ],
      [
        { ...d20(), target: "other", sides: 7, result: 8 },
        "Render request groups[0][0].result must be from 1 through 7",
      ],
    ];
    for (const [die, message] of invalidResults) {
      expect(() =>
        validateRenderRequestV3({ version: 3, groups: [[die]] }),
      ).toThrow(message);
    }
    expect(() =>
      validateRenderRequestV3({
        version: 3,
        groups: [[{ ...d20(), target: "other", sides: 1_000, result: 1 }]],
      }),
    ).toThrow("Render request groups[0][0].sides must be from 1 through 999");
  });

  it("keeps V2 and V3 validation as direct version branches", () => {
    const v2 = {
      version: 2,
      groups: [[
        {
          target: "d20",
          result: 20,
          appearance: {
            primaryColor: "#5426a8",
            secondaryColor: "#c93ee8",
            textColor: "#ffffff",
            outlineColor: "#000000",
            fill: { type: "gradient" },
            fontId: "liberation-sans",
            effect: null,
            requiresLocalSeparation: false,
          },
          icons: [],
        },
      ]],
    };

    expect(validateRenderRequestV2(v2)).toEqual(v2);
    expect(() => validateRenderRequestV3(v2)).toThrow(
      "Render request version must be 3",
    );
    expect(() => validateRenderRequestV2(allTargetsRequest())).toThrow(
      "Render request version must be 2",
    );
  });
});

describe("migrated V3 compatibility evidence", () => {
  const canonicalFixedGradient: AppearanceRecipeV1 = {
    version: 1,
    variation: "fixed",
    varyBy: "die",
    colors: { mode: "random", primary: "#6f7680" },
    fill: { mode: "fixed", value: { type: "gradient" } },
    font: { mode: "fixed", fontId: "liberation-sans" },
  };
  const fixtures: readonly [string, AppearanceRecipeV1][] = [
    [
      "mid-tone solid",
      compatibilityRecipe(
        { type: "solid" },
        { mode: "palette", colors: ["#777777", "#888888"] },
      ),
    ],
    ["canonical fixed gradient", canonicalFixedGradient],
    [
      "pattern",
      compatibilityRecipe({
        type: "pattern",
        patternId: "checkerboard",
      }),
    ],
  ];

  it.each(fixtures)(
    "preserves %s pixels on every target",
    async (_name, recipe) => {
      const v2 = buildRollRenderRequestV2(
        compatibilityRoll,
        0x1234_abcd,
        compatibilityRecipes(recipe),
      );
      const v3 = buildRollRenderRequestV3(
        compatibilityRoll,
        0x1234_abcd,
        migratedCompatibilityRecipes(recipe),
      );
      const expectedTargets = [...APPEARANCE_TARGETS];

      expect(v2.groups[0]?.map(({ target }) => target)).toEqual(
        expectedTargets,
      );
      expect(v3.groups[0]?.map(({ target }) => target)).toEqual(
        expectedTargets,
      );
      expect(
        v3.groups[0]?.map(({ appearance: resolved }) => resolved.lighting),
      ).toEqual(
        expectedTargets.map(() => ({ mode: "facet", strength: "subtle" })),
      );

      const [renderedV2, renderedV3] = await Promise.all([
        renderDiceRequestV2ToPng(v2),
        renderDiceRequestV3ToPng(v3),
      ]);
      expect({
        width: renderedV3.width,
        height: renderedV3.height,
        diceCount: renderedV3.diceCount,
        rowCount: renderedV3.rowCount,
      }).toEqual({
        width: renderedV2.width,
        height: renderedV2.height,
        diceCount: renderedV2.diceCount,
        rowCount: renderedV2.rowCount,
      });
      expect(renderedV3.png).toEqual(renderedV2.png);
    },
  );

  it("keeps the canonical V1 fixed seed and mid-tone Other contrast", () => {
    const canonicalJson =
      '{"version":1,"variation":"fixed","varyBy":"die","colors":{"mode":"random","primary":"#6f7680"},"fill":{"mode":"fixed","value":{"type":"gradient"}},"font":{"mode":"fixed","fontId":"liberation-sans"}}';
    const migrated = migrateAppearanceRecipeV1(canonicalFixedGradient);
    expect(JSON.stringify(legacyAppearanceRecipeV1(migrated))).toBe(
      canonicalJson,
    );

    const v2Gradient = buildRollRenderRequestV2(
      compatibilityRoll,
      0,
      compatibilityRecipes(canonicalFixedGradient),
    );
    const v3Gradient = buildRollRenderRequestV3(
      compatibilityRoll,
      0xffff_ffff,
      migratedCompatibilityRecipes(canonicalFixedGradient),
    );
    expect(v2Gradient.groups[0]?.[0]?.appearance.secondaryColor).toBe(
      "#73569c",
    );
    expect(v3Gradient.groups[0]?.[0]?.appearance.surface).toEqual({
      type: "gradient",
      colors: ["#6f7680", "#73569c"],
      scope: "repeated",
      direction: "top-to-bottom",
    });

    const midTone = compatibilityRecipe(
      { type: "solid" },
      { mode: "palette", colors: ["#777777", "#888888"] },
    );
    const otherV2 = buildRollRenderRequestV2(
      compatibilityRoll,
      1,
      compatibilityRecipes(midTone),
    ).groups[0]?.at(-1)?.appearance;
    const otherV3 = buildRollRenderRequestV3(
      compatibilityRoll,
      1,
      migratedCompatibilityRecipes(midTone),
    ).groups[0]?.at(-1)?.appearance;
    expect(otherV2).toMatchObject({
      textColor: "#faf9f6",
      requiresLocalSeparation: true,
    });
    expect(otherV3).toMatchObject({
      surface: { type: "solid", color: "#777777" },
      textColor: "#faf9f6",
      requiresLocalSeparation: true,
    });
  });
});
