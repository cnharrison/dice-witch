import { describe, expect, it } from "vitest";
import {
  composeD6AppearanceSvg,
  composeD8AppearanceSvg,
  composeFudgeAppearanceSvg,
  type AppearanceFontId,
} from "../../packages/dice-svg/src";

const appearance = {
  primaryColor: "#5426a8",
  secondaryColor: "#c93ee8",
  textColor: "#ffffff",
  outlineColor: "#000000" as const,
  fill: { type: "gradient" as const },
  effect: null,
};

function resultLabel(svg: string): string {
  const start = svg.indexOf('data-label-slot="result"');
  const end = svg.indexOf("</g>\n  </g>", start);
  return svg.slice(start, end);
}

function renderD6(fontId: AppearanceFontId): string {
  return composeD6AppearanceSvg({ ...appearance, fontId, result: 6 });
}

function renderFudge(fontId: AppearanceFontId): string {
  return composeFudgeAppearanceSvg({ ...appearance, fontId, result: 1 });
}

describe("appearance font optical alignment", () => {
  it("centers Special Elite numerals and operators against Liberation Sans", () => {
    expect(resultLabel(renderD6("special-elite"))).toContain('dy="33.46"');
    expect(resultLabel(renderFudge("special-elite"))).toContain('dy="58.09"');
  });

  it("centers the Creeping Horror plus against Liberation Sans", () => {
    expect(resultLabel(renderFudge("creeping-horror"))).toContain(
      'dy="-33.5"',
    );
  });

  it("normalizes oversized font projections without moving d8 anchors", () => {
    const svg = composeD8AppearanceSvg({
      ...appearance,
      fontId: "fontdiner-swanky",
      result: 8,
    });

    expect(svg).toMatch(
      /data-label-slot="right"[\s\S]*?matrix\(0\.002 -0\.606 0\.478 0\.484 474 210\)/,
    );
  });

  it("leaves the Liberation Sans reference baseline unchanged", () => {
    expect(resultLabel(renderD6("liberation-sans"))).not.toContain(" dy=");
    expect(resultLabel(renderFudge("liberation-sans"))).not.toContain(" dy=");
  });
});
