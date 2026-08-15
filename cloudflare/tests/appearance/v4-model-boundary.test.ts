import {
  D20_SHARP_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_V4,
  RENDERER_REVISIONS_V4,
  deriveNamedSeedV4,
  getCanonicalGeometryDescriptorV4,
  projectPolyhedralGeometryV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";

describe("shared V4 model Cloudflare boundary", () => {
  it("loads the shared registry and deterministic seed implementation", () => {
    expect(RENDERER_REVISIONS_V4).toEqual([
      "canvaskit-v4-r1",
      "canvaskit-v4-r2",
      "canvaskit-v4-r3",
      "canvaskit-v4-r4",
      "canvaskit-v4-r5",
      "canvaskit-v4-r6",
      "canvaskit-v4-r7",
      "canvaskit-v4-r8",
      "canvaskit-v4-r9",
      "canvaskit-v4-r10",
      "canvaskit-v4-r11",
      "canvaskit-v4-r12",
      "canvaskit-v4-r13",
      "canvaskit-v4-r14",
      "canvaskit-v4-r15",
      "canvaskit-v4-r16",
      "canvaskit-v4-r17",
      "canvaskit-v4-r18",
      "canvaskit-v4-r19",
      "canvaskit-v4-r20",
      "canvaskit-v4-r21",
      "canvaskit-v4-r22",
      "canvaskit-v4-r23",
      "canvaskit-v4-r24",
      "canvaskit-v4-r25",
      "canvaskit-v4-r26",
      "canvaskit-v4-r27",
      "canvaskit-v4-r28",
      "canvaskit-v4-r29",
      "canvaskit-v4-r30",
      "canvaskit-v4-r31",
      "canvaskit-v4-r32",
      "canvaskit-v4-r33",
      "canvaskit-v4-r34",
      "canvaskit-v4-r35",
    ]);
    expect(deriveNamedSeedV4(123, "material")).toBe(2_641_807_242);
    const projection = projectPolyhedralGeometryV4(
      D20_STANDARD_GEOMETRY_V4,
      20,
    );
    expect(projection.visibleFaces.length).toBeGreaterThan(0);
    expect(getCanonicalGeometryDescriptorV4("other-sphere-r1").kind).toBe(
      "sphere",
    );
    expect(getCanonicalGeometryDescriptorV4("d20-sharp-r1")).toBe(
      D20_SHARP_GEOMETRY_V4,
    );
  });
});
