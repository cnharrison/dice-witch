import {
  D20_CRYSTAL_CUT_GEOMETRY_V4,
  D20_HOLLOW_CAGE_GEOMETRY_V4,
  D20_SHARP_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_R2_V4,
  D4_STANDARD_GEOMETRY_V4,
  OTHER_SPHERE_GEOMETRY_V4,
  R32_FONT_IDS_V4,
  buildPhysicalPolyhedralMeshV4,
  parsePublicRenderModelV4,
  projectPolyhedralGeometryV4,
} from "@dice-witch/dice-v4-model";
import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import d20Fixture from "./fixtures/d20-r3.json";
import {
  createFaceAtlasLayoutV4,
  createPhysicalLabelAtlasResourcesFromSourceV4,
  createPhysicalLabelAtlasSourceV4,
  createPhysicalLabelGeometryV4,
  createSphericalLabelGeometryV4,
  faceAtlasUvV4,
  fitLabelFontSizeToClearanceV4,
  usesProjectedLabelClearanceV4,
} from "./face-atlas";

function labelCanvasHarness() {
  const drawn: string[] = [];
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  const context = {
    canvas,
    font: "",
    beginPath: () => undefined,
    clip: () => undefined,
    drawImage: () => undefined,
    fillText: (text: string) => drawn.push(text),
    lineTo: () => undefined,
    measureText: (text: string) => {
      const fontSize = Number.parseFloat(context.font) || 100;
      const width = Array.from(text).length * fontSize * 0.56;
      return {
        width,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: width,
        actualBoundingBoxAscent: fontSize * 0.72,
        actualBoundingBoxDescent: fontSize * 0.18,
      } as TextMetrics;
    },
    moveTo: () => undefined,
    rect: () => undefined,
    restore: () => undefined,
    save: () => undefined,
    stroke: () => undefined,
    strokeText: (text: string) => drawn.push(text),
  } as unknown as CanvasRenderingContext2D;
  canvas.getContext = (() => context) as HTMLCanvasElement["getContext"];
  return { canvas, drawn };
}

describe("V4 Three.js face atlas layout", () => {
  it("formats and draws every r32 font before browser-atlas measurement", () => {
    const die = parsePublicRenderModelV4(d20Fixture).groups[0]?.[0];
    if (die === undefined) throw new Error("D20 font fixture is missing");
    const physical = buildPhysicalPolyhedralMeshV4(
      D20_STANDARD_GEOMETRY_R2_V4,
      20,
    );
    const projection = projectPolyhedralGeometryV4(
      D20_STANDARD_GEOMETRY_R2_V4,
      20,
    );

    try {
      for (const fontId of R32_FONT_IDS_V4) {
        const harness = labelCanvasHarness();
        vi.stubGlobal("document", {
          createElement: () => harness.canvas,
        });
        const source = createPhysicalLabelAtlasSourceV4(
          physical,
          projection,
          D20_STANDARD_GEOMETRY_R2_V4.camera,
          {
            ...die.appearance,
            engraving: { ...die.appearance.engraving, fontId },
          },
          `DiceWitchV4-${fontId}`,
          "canvaskit-v4-r32",
        );

        expect(Number.isFinite(source.minimumVisibleLabelFontScale)).toBe(true);
        if (fontId === "alcarin-tengwar") {
          expect(harness.drawn).toContain("\ue070\ue072");
          expect(harness.drawn.some((text) => /[0-9]/.test(text))).toBe(false);
        } else {
          expect(harness.drawn).toContain("20");
        }
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("honors renderer revisions that allow minimum-size label clearance shortfalls", () => {
    const clearanceAt = (fontSize: number) => 1 - fontSize / 100;

    expect(
      fitLabelFontSizeToClearanceV4(100, 0.35, 0.8, clearanceAt, true),
    ).toBe(35);
    expect(() =>
      fitLabelFontSizeToClearanceV4(100, 0.35, 0.8, clearanceAt, false),
    ).toThrow("Three.js V4 label cannot preserve edge clearance");
  });

  it("matches authoritative projected-clearance scope", () => {
    expect(usesProjectedLabelClearanceV4("d20-standard-r2")).toBe(true);
    expect(usesProjectedLabelClearanceV4("d20-hollow-cage-r1")).toBe(false);
    expect(usesProjectedLabelClearanceV4("d12-standard-r1")).toBe(false);
    expect(usesProjectedLabelClearanceV4("d10-standard-r1")).toBe(false);
  });

  it("maps six isolated face tiles without sampling adjacent cells", () => {
    const layout = createFaceAtlasLayoutV4(6);

    expect(layout).toEqual({
      faceCount: 6,
      columns: 3,
      rows: 2,
      tileSize: 192,
      gutter: 1,
      cellSize: 194,
      width: 582,
      height: 388,
    });
    expect(faceAtlasUvV4(layout, 0, 0, 0)).toEqual([
      1.5 / 582,
      1.5 / 388,
    ]);
    expect(faceAtlasUvV4(layout, 0, 1, 1)).toEqual([
      192.5 / 582,
      192.5 / 388,
    ]);
    expect(faceAtlasUvV4(layout, 5, 0, 0)).toEqual([
      389.5 / 582,
      195.5 / 388,
    ]);
    expect(faceAtlasUvV4(layout, 5, 1, 1)).toEqual([
      580.5 / 582,
      386.5 / 388,
    ]);
  });

  it("builds one canonical posed quad for every conventional and cage label", () => {
    for (const [descriptor, result] of [
      [D4_STANDARD_GEOMETRY_V4, 4],
      [D20_STANDARD_GEOMETRY_R2_V4, 20],
      [D20_SHARP_GEOMETRY_V4, 20],
      [D20_CRYSTAL_CUT_GEOMETRY_V4, 20],
      [D20_HOLLOW_CAGE_GEOMETRY_V4, 20],
    ] as const) {
      const labels = buildPhysicalPolyhedralMeshV4(descriptor, result).labels;
      const layout = createFaceAtlasLayoutV4(labels.length);
      const geometry = createPhysicalLabelGeometryV4(labels, layout);
      const positions = geometry.getAttribute("position");
      const normals = geometry.getAttribute("normal");
      const indices = geometry.getIndex();
      if (indices === null) throw new Error("Label geometry index is missing");

      expect(positions.count).toBe(labels.length * 4);
      expect(normals.count).toBe(labels.length * 4);
      expect(geometry.getAttribute("uv").count).toBe(labels.length * 4);
      expect(indices.count).toBe(labels.length * 6);
      labels.forEach((label, labelIndex) => {
        const firstVertex = labelIndex * 4;
        const center = new Vector3();
        for (let vertex = 0; vertex < 4; vertex += 1) {
          center.add(
            new Vector3().fromBufferAttribute(positions, firstVertex + vertex),
          );
        }
        center.multiplyScalar(0.25).sub(new Vector3(...label.origin));
        expect(center.dot(new Vector3(...label.normal))).toBeCloseTo(0.006, 6);

        const first = new Vector3().fromBufferAttribute(positions, firstVertex);
        const second = new Vector3().fromBufferAttribute(
          positions,
          firstVertex + 1,
        );
        const third = new Vector3().fromBufferAttribute(
          positions,
          firstVertex + 2,
        );
        expect(
          second
            .sub(first)
            .cross(third.sub(first))
            .dot(new Vector3(...label.normal)),
        ).toBeGreaterThan(0);
      });
      geometry.dispose();
    }

    expect(
      buildPhysicalPolyhedralMeshV4(D4_STANDARD_GEOMETRY_V4, 4).labels,
    ).toHaveLength(12);
    const hollow = buildPhysicalPolyhedralMeshV4(
      D20_HOLLOW_CAGE_GEOMETRY_V4,
      20,
    );
    expect(hollow.faces).toHaveLength(140);
    expect(hollow.labels).toHaveLength(20);
    expect(
      hollow.labels.every(({ faceId }) => faceId.startsWith("plaque-")),
    ).toBe(true);
  });

  it("wraps a spherical label over the canonical Other surface", () => {
    const geometry = createSphericalLabelGeometryV4(
      OTHER_SPHERE_GEOMETRY_V4,
    );
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const indices = geometry.getIndex();
    if (indices === null) throw new Error("Sphere label index is missing");

    expect(positions.count).toBe(221);
    expect(normals.count).toBe(221);
    expect(geometry.getAttribute("uv").count).toBe(221);
    expect(indices.count).toBe(1_152);
    const center = 6 * 17 + 8;
    expect(positions.getX(center)).toBe(0);
    expect(positions.getY(center)).toBe(0);
    expect(positions.getZ(center)).toBeCloseTo(1.006, 6);
    expect(Array.from(normals.array.slice(center * 3, center * 3 + 3))).toEqual([
      0, 0, 1,
    ]);
    for (let offset = 0; offset < indices.count; offset += 3) {
      const first = new Vector3().fromBufferAttribute(
        positions,
        indices.getX(offset),
      );
      const second = new Vector3().fromBufferAttribute(
        positions,
        indices.getX(offset + 1),
      );
      const third = new Vector3().fromBufferAttribute(
        positions,
        indices.getX(offset + 2),
      );
      const normal = new Vector3().fromBufferAttribute(
        normals,
        indices.getX(offset),
      );
      expect(
        second.sub(first).cross(third.sub(first)).dot(normal),
      ).toBeGreaterThan(0);
    }
    geometry.dispose();

    expect(() =>
      createSphericalLabelGeometryV4(OTHER_SPHERE_GEOMETRY_V4, 0),
    ).toThrow("Three.js V4 spherical label geometry is invalid");
  });

  it("rejects invalid face and coordinate inputs", () => {
    expect(() => createFaceAtlasLayoutV4(0)).toThrow(
      "Three.js V4 face atlas count is invalid",
    );
    const layout = createFaceAtlasLayoutV4(6);
    expect(() => faceAtlasUvV4(layout, 6, 0, 0)).toThrow(
      "Three.js V4 face atlas coordinate is invalid",
    );
    expect(() => faceAtlasUvV4(layout, 0, -0.01, 0)).toThrow(
      "Three.js V4 face atlas coordinate is invalid",
    );
    const labels = buildPhysicalPolyhedralMeshV4(
      D4_STANDARD_GEOMETRY_V4,
      4,
    ).labels;
    expect(() =>
      createPhysicalLabelGeometryV4(labels, createFaceAtlasLayoutV4(1)),
    ).toThrow("Three.js V4 label atlas layout does not match labels");

    const physical = buildPhysicalPolyhedralMeshV4(
      D4_STANDARD_GEOMETRY_V4,
      4,
    );
    const sourceLayout = createFaceAtlasLayoutV4(physical.labels.length);
    expect(() =>
      createPhysicalLabelAtlasResourcesFromSourceV4(physical, {
        canvas: {
          width: sourceLayout.width,
          height: sourceLayout.height,
        } as HTMLCanvasElement,
        geometryId: "d20-standard-r2",
        result: physical.result,
        labelCount: physical.labels.length,
        minimumVisibleLabelGapPixelsAt150: 0.75,
        minimumVisibleLabelFontScale: 1,
        resultLabelFontScale: 1,
      }),
    ).toThrow("Three.js V4 label atlas source does not match labels");
  });
});
