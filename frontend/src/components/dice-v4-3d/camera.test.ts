import {
  D20_STANDARD_GEOMETRY_R2_V4,
  getAuthoredRenderViewV4,
  getRenderGeometryDescriptorV4,
} from "@dice-witch/dice-v4-model";
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

  it("uses the resolved authored d6 camera without browser-side interpretation", () => {
    const result = 6;
    const view = getAuthoredRenderViewV4("canvaskit-v4-r20", "clear", {
      target: "d6",
      form: "standard",
      result,
    });
    const descriptor = getRenderGeometryDescriptorV4(
      "canvaskit-v4-r20",
      { target: "d6", form: "standard", result, view },
    );
    const camera = createThreeOrthographicCameraV4(descriptor, 1);

    expect(camera.position.toArray()).toEqual(descriptor.camera.position);
    expect(camera.up.toArray()).toEqual(descriptor.camera.up);
    expect(camera.top - camera.bottom).toBe(descriptor.camera.orthographicHeight);
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
