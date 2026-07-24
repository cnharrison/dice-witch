import { describe, expect, it } from "vitest";
import {
  composeDiceSvgV2,
  renderDiceRequestV2ToPng,
  validateRenderRequestV2,
  type RenderAppearanceV2,
  type RenderRequestV2,
} from "../../packages/dice-svg/src";

const appearance: RenderAppearanceV2 = {
  primaryColor: "#5426a8",
  secondaryColor: "#c93ee8",
  textColor: "#ffffff",
  outlineColor: "#000000",
  fill: { type: "gradient" },
  fontId: "liberation-sans",
  effect: null,
  requiresLocalSeparation: false,
};

function allTargetsRequest(): RenderRequestV2 {
  return {
    version: 2,
    groups: [
      [
        { target: "d4", result: 4, appearance, icons: [] },
        { target: "d6", result: 6, appearance, icons: [] },
        { target: "d8", result: 8, appearance, icons: [] },
        { target: "d10", result: 10, appearance, icons: [] },
        { target: "d12", result: 12, appearance, icons: [] },
        {
          target: "d20",
          result: 20,
          appearance: { ...appearance, effect: "critical-success" },
          icons: ["critical-success"],
        },
      ],
      [
        { target: "percentile", result: 0, appearance, icons: [] },
        { target: "fudge", result: 0, appearance, icons: [] },
        { target: "other", sides: 7, result: 6, appearance, icons: [] },
      ],
    ],
  };
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
}

describe("RenderRequestV2", () => {
  it("strictly validates and canonicalizes the fully resolved snapshot", () => {
    const parsed = validateRenderRequestV2({
      ...allTargetsRequest(),
      groups: [[
        {
          target: "d20",
          result: 20,
          appearance: {
            ...appearance,
            primaryColor: "#ABCDEF",
            fill: { type: "pattern", pattern: "checkerboard" },
            fontId: "new-rocker",
          },
          icons: ["critical-success"],
        },
      ]],
    });

    expect(parsed.version).toBe(2);
    expect(parsed.groups[0]?.[0]?.appearance.primaryColor).toBe("#abcdef");
    expect(parsed.groups[0]?.[0]?.appearance.fill).toEqual({
      type: "pattern",
      pattern: "checkerboard",
    });
  });

  it("composes every appearance target through one grid", () => {
    const composed = composeDiceSvgV2(allTargetsRequest());

    expect(composed.diceCount).toBe(9);
    expect(composed.rowCount).toBe(2);
    expect(composed.width).toBe(900);
    expect(composed.height).toBe(374);
    for (const target of [
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d20",
      "percentile",
      "fudge",
      "other",
    ]) {
      expect(composed.svg).toContain(`data-render-target="${target}"`);
    }
  });

  it("isolates each die's font styling in a composed roll", () => {
    const request = allTargetsRequest();
    const first = request.groups[0]?.[0];
    const second = request.groups[0]?.[1];
    if (first === undefined || second === undefined) {
      throw new Error("Fixture dice are missing");
    }

    const composed = composeDiceSvgV2({
      version: 2,
      groups: [[
        first,
        {
          ...second,
          appearance: { ...second.appearance, fontId: "new-rocker" },
        },
      ]],
    }).svg;

    expect(composed).toContain(
      '.dw-die-0-engraving-text{font-family:"Liberation Sans"',
    );
    expect(composed).toContain(
      '.dw-die-1-engraving-text{font-family:"New Rocker"',
    );
    expect(composed).not.toMatch(/(?:^|[>}\s])text\{/);
  });

  it("namespaces each die's shared face pattern", () => {
    const patternedAppearance: RenderAppearanceV2 = {
      ...appearance,
      fill: { type: "pattern", pattern: "checkerboard" },
    };
    const svg = composeDiceSvgV2({
      version: 2,
      groups: [[
        {
          target: "d20",
          result: 6,
          appearance: patternedAppearance,
          icons: [],
        },
        {
          target: "d20",
          result: 9,
          appearance: patternedAppearance,
          icons: [],
        },
      ]],
    }).svg;

    for (const index of [0, 1]) {
      const patternId = `dw-die-${String(index)}-pattern_checkerboard_5426a8_c93ee8`;
      expect(svg).toContain(`id="${patternId}"`);
      expect(svg.match(new RegExp(`fill="url\\(#${patternId}\\)"`, "g"))).toHaveLength(10);
    }
    expect(svg).not.toContain('id="pattern_checkerboard_5426a8_c93ee8"');
    expect(svg).not.toContain("_face-");
  });

  it("is byte-stable for a persisted request", () => {
    const request = allTargetsRequest();
    expect(composeDiceSvgV2(request).svg).toBe(composeDiceSvgV2(request).svg);
  });

  it("rasterizes the same composed request with embedded fonts", async () => {
    const rendered = await renderDiceRequestV2ToPng(allTargetsRequest());

    expect(rendered.version).toBe(2);
    expect(rendered.diceCount).toBe(9);
    expect(rendered.width).toBe(900);
    expect(rendered.height).toBe(374);
    expect(hasPngSignature(rendered.png)).toBe(true);
  });

  it("rejects unknown fields and invalid target results", () => {
    const request = allTargetsRequest();
    const die = request.groups[0]?.[0];
    if (die === undefined) throw new Error("Fixture die is missing");

    expect(() =>
      validateRenderRequestV2({
        ...request,
        groups: [[{ ...die, rawSvg: "<script/>" }]],
      }),
    ).toThrow("Render request groups[0][0] has invalid fields");
    expect(() =>
      validateRenderRequestV2({
        ...request,
        groups: [[{ ...die, result: 5 }]],
      }),
    ).toThrow("Render request groups[0][0].result must be from 1 through 4");
    expect(() =>
      validateRenderRequestV2({
        ...request,
        groups: [[
          {
            ...die,
            appearance: {
              ...die.appearance,
              fill: { type: "pattern", pattern: "stripes-v2" },
            },
          },
        ]],
      }),
    ).toThrow("Render request groups[0][0].appearance.fill is invalid");
  });

  it("applies local separation across every target", () => {
    const request = allTargetsRequest();
    const separated: RenderRequestV2 = {
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
      composeDiceSvgV2(separated).svg.match(/data-local-separation=/g),
    ).toHaveLength(40);
  });

  it("rejects non-black appearance borders", () => {
    const request = allTargetsRequest();
    const die = request.groups[0]?.[0];
    if (die === undefined) throw new Error("Fixture die is missing");

    expect(() =>
      validateRenderRequestV2({
        version: 2,
        groups: [[
          {
            ...die,
            appearance: { ...die.appearance, outlineColor: "#ffffff" },
          },
        ]],
      }),
    ).toThrow("Render request groups[0][0].appearance.outlineColor must be #000000");
  });

  it("renders an explicit local-separation requirement with same-ink numeral weight", () => {
    const request = allTargetsRequest();
    const die = request.groups[0]?.[0];
    if (die === undefined) throw new Error("Fixture die is missing");
    const separated: RenderRequestV2 = {
      version: 2,
      groups: [[
        {
          ...die,
          appearance: {
            ...die.appearance,
            requiresLocalSeparation: true,
          },
        },
      ]],
    };

    expect(validateRenderRequestV2(separated)).toEqual(separated);
    const svg = composeDiceSvgV2(separated).svg;
    expect(svg).toContain('<polygon data-local-separation="true"');
    expect(svg).toContain("paint-order:stroke fill");
    expect(svg).not.toContain('id="local-separation"');
  });
});
