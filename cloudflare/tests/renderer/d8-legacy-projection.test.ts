import { describe, expect, it } from "vitest";
import generateD8 from "../../packages/dice-svg/src/dice/generateD8";

const style = {
  textColor: "#ffffff",
  outlineColor: "#000000",
  solidFill: "#111111",
};

describe("legacy d8 projection", () => {
  it("renders Liberation glyphs through the original four face projections", () => {
    const svg = generateD8({ ...style, result: 8 });

    expect(svg).toContain('font-family="Liberation Sans, Arial, sans-serif"');
    expect(svg).toMatch(
      /data-label-slot="result" data-face-value="8" transform="matrix\(1 0 0 1 200 201\.333\)"/,
    );
    expect(svg).toMatch(
      /data-label-slot="left" data-face-value="1" transform="matrix\(-0\.002697 0\.826487 -0\.512543 0\.483042 90\.667 139\.333\)"/,
    );
    expect(svg).toMatch(
      /data-label-slot="right" data-face-value="5" transform="matrix\(0\.001982 -0\.791886 0\.607575 0\.615869 316 140\)"/,
    );
    expect(svg).toMatch(
      /data-label-slot="bottom" data-face-value="3" transform="matrix\(-0\.827525 0\.000625 -0\.000733 -0\.532846 200\.667 316\)"/,
    );
    expect(svg.match(/<text /g)).toHaveLength(4);
    expect(svg).not.toContain('<path class="text"');
  });

  it("projects one orientation mark with each visible six", () => {
    const svg = generateD8({ ...style, result: 3 });

    expect(svg).toContain('data-label-slot="right" data-face-value="6"');
    expect(svg.match(/data-orientation-mark="true"/g)).toHaveLength(1);
  });
});
