import { describe, expect, it } from "vitest";
import {
  resolveFacetLabelFrame,
  type FacetLabelFrame,
} from "../../packages/dice-svg/src/facetProjection";

const leftD8Frame: FacetLabelFrame = {
  anchor: [0.267, 0.293, 0.44],
  xAxis: {
    from: [0.271756126, 0.136328426, 0.591915448],
    to: [0.262243874, 0.449671574, 0.288084552],
    sourceLength: 100,
  },
  yAxis: {
    from: [0.381411954, 0.254672943, 0.363915103],
    to: [0.152588046, 0.331327057, 0.516084897],
    sourceLength: 100,
  },
};

describe("facet label projection", () => {
  it("derives both d8 projection axes from its vertices", () => {
    const frame = resolveFacetLabelFrame(
      "300,42 80,426 74,166",
      leftD8Frame,
    );

    expect(frame.x).toBeCloseTo(136.1, 3);
    expect(frame.y).toBeCloseTo(209.072, 3);
    expect(frame.a).toBeCloseTo(-0.002697, 6);
    expect(frame.b).toBeCloseTo(0.826487, 6);
    expect(frame.c).toBeCloseTo(-0.512543, 6);
    expect(frame.d).toBeCloseTo(0.483042, 6);
    expect(frame.a * frame.c + frame.b * frame.d).not.toBeCloseTo(0, 3);
  });

  it("rejects a projection whose axes collapse onto one line", () => {
    expect(() =>
      resolveFacetLabelFrame("0,0 100,0 0,100", {
        anchor: [1, 0, 0],
        xAxis: {
          from: [1, 0, 0],
          to: [0, 1, 0],
          sourceLength: 100,
        },
        yAxis: {
          from: [1, 0, 0],
          to: [0, 1, 0],
          sourceLength: 100,
        },
      }),
    ).toThrow("Facet label axes must span a plane");
  });

  it("reprojects both label axes when a source vertex moves", () => {
    const original = resolveFacetLabelFrame(
      "300,42 80,426 74,166",
      leftD8Frame,
    );
    const moved = resolveFacetLabelFrame(
      "320,42 80,426 74,166",
      leftD8Frame,
    );

    expect(moved.x - original.x).toBeCloseTo(5.34, 3);
    expect(moved.a).not.toBeCloseTo(original.a, 6);
    expect(moved.c).not.toBeCloseTo(original.c, 6);
  });
});
