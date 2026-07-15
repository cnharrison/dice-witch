import { describe, expect, it } from "vitest";
import {
  composeDiceSvg,
  type IconName,
  type RenderDie,
} from "../../packages/dice-svg/src";

function createDie(
  sides: RenderDie["sides"] = 20,
  rolled = 17,
  icons: IconName[] = [],
): RenderDie {
  return {
    sides,
    rolled,
    color: "#6f42c1",
    secondaryColor: "#24143d",
    textColor: "#faf9f6",
    outlineColor: "#000000",
    icons,
    fill: { type: "gradient" },
  };
}

describe("composeDiceSvg", () => {
  it("composes a single die at the legacy dimensions", () => {
    const result = composeDiceSvg({ version: 1, groups: [[createDie()]] });

    expect(result.width).toBe(150);
    expect(result.height).toBe(150);
    expect(result.diceCount).toBe(1);
    expect(result.rowCount).toBe(1);
    expect(result.svg).toContain('viewBox="0 0 150 150"');
  });

  it("matches the maximum-width 50-dice legacy layout", () => {
    const dice = Array.from({ length: 50 }, (_, index) =>
      createDie(20, (index % 20) + 1),
    );

    const result = composeDiceSvg({ version: 1, groups: [dice] });

    expect(result.width).toBe(1500);
    expect(result.height).toBe(750);
    expect(result.diceCount).toBe(50);
    expect(result.rowCount).toBe(5);
  });

  it("matches the maximum-height 50-group layout with icons", () => {
    const groups = Array.from({ length: 50 }, (_, index) => [
      createDie(20, (index % 20) + 1, ["critical-success"]),
    ]);

    const result = composeDiceSvg({ version: 1, groups });

    expect(result.width).toBe(150);
    expect(result.height).toBe(9350);
    expect(result.diceCount).toBe(50);
    expect(result.rowCount).toBe(50);
  });

  it("namespaces IDs and CSS classes for every nested SVG", () => {
    const result = composeDiceSvg({
      version: 1,
      groups: [[createDie(37, 19), createDie(37, 23)]],
    });
    const ids = [...result.svg.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);

    expect(new Set(ids).size).toBe(ids.length);
    expect(result.svg).not.toContain('id="surfaceGradient"');
    expect(result.svg).not.toContain('url(#surfaceGradient)');
  });

  it("renders every current pattern by explicit name", () => {
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
    ] as const;
    const dice = patterns.map((pattern, index) => ({
      ...createDie(20, index + 1),
      fill: { type: "pattern" as const, pattern },
    }));

    const result = composeDiceSvg({ version: 1, groups: [dice] });

    for (const pattern of patterns) {
      expect(result.svg).toContain(pattern);
    }
  });

  it("renders the d10 zero face labels at the same visual scale as other faces", () => {
    const result = composeDiceSvg({
      version: 1,
      groups: [[createDie(10, 0)]],
    });
    const fontSizes = [...result.svg.matchAll(/font-size="([0-9]+)"/g)].map(
      (match) => Number(match[1]),
    );

    expect(fontSizes).toEqual([112, 80, 80, 80, 80]);
  });

  it("preserves legacy modulo display for compounded numeric results", () => {
    const baseRequest = { version: 1 as const, groups: [[createDie(6, 1)]] };
    const compoundedRequest = {
      version: 1 as const,
      groups: [[createDie(6, 7)]],
    };

    expect(composeDiceSvg(compoundedRequest).svg).toBe(
      composeDiceSvg(baseRequest).svg,
    );
  });

  it("rejects more than 50 dice before composing", () => {
    const dice = Array.from({ length: 51 }, () => createDie());

    expect(() => composeDiceSvg({ version: 1, groups: [dice] })).toThrow(
      "Render request exceeds 50 dice",
    );
  });

  it("rejects unsafe color input", () => {
    const die = { ...createDie(), color: "url(https://example.com/image.svg)" };

    expect(() => composeDiceSvg({ version: 1, groups: [[die]] })).toThrow(
      "color must be a six-digit hex color",
    );
  });
});
