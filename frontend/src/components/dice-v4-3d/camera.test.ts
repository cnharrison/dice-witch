import { D20_STANDARD_GEOMETRY_R2_V4 } from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import { createThreeOrthographicCameraV4 } from "./camera";

describe("V4 Three.js camera", () => {
  it("matches the authoritative square framing", () => {
    const camera = createThreeOrthographicCameraV4(
      D20_STANDARD_GEOMETRY_R2_V4,
      1,
    );

    expect(camera.left).toBeCloseTo(-1.175, 12);
    expect(camera.right).toBeCloseTo(1.175, 12);
    expect(camera.top).toBeCloseTo(1.175, 12);
    expect(camera.bottom).toBeCloseTo(-1.175, 12);
    expect(camera.position.toArray()).toEqual(
      D20_STANDARD_GEOMETRY_R2_V4.camera.position,
    );
    expect(camera.up.toArray()).toEqual(
      D20_STANDARD_GEOMETRY_R2_V4.camera.up,
    );
  });

  it("expands vertical framing for portrait viewports without cropping width", () => {
    const camera = createThreeOrthographicCameraV4(
      D20_STANDARD_GEOMETRY_R2_V4,
      0.5,
    );

    expect(camera.left).toBeCloseTo(-1.175, 12);
    expect(camera.right).toBeCloseTo(1.175, 12);
    expect(camera.top).toBeCloseTo(2.35, 12);
    expect(camera.bottom).toBeCloseTo(-2.35, 12);
  });

  it("rejects invalid viewport aspects", () => {
    expect(() =>
      createThreeOrthographicCameraV4(D20_STANDARD_GEOMETRY_R2_V4, 0),
    ).toThrow("Three.js V4 camera aspect is invalid");
    expect(() =>
      createThreeOrthographicCameraV4(
        D20_STANDARD_GEOMETRY_R2_V4,
        Number.POSITIVE_INFINITY,
      ),
    ).toThrow("Three.js V4 camera aspect is invalid");
  });
});
