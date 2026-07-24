import {
  D20_STANDARD_GEOMETRY_R2_V4,
  D20_STANDARD_GEOMETRY_V4,
  ENGRAVING_FINISHES_V4,
  FONT_IDS_V4,
  projectPolyhedralGeometryV4,
  type EngravingFinishV4,
  type FontIdV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import { CANVASKIT_FONT_DATA_V4 } from "../src/font-assets";
import { CanvasKitGeometryRendererV4 } from "../src/geometry-renderer";
import {
  CANVASKIT_INITIAL_MEMORY_BYTES_V4,
  loadCanvasKitV4,
} from "../src/runtime";
import {
  APPROVED_D20_R3_ORIENTATION_MARK_PNG_SHA256_V4,
  APPROVED_D20_R3_REVIEW_PNG_SHA256_V4,
} from "./approved-hashes";
import { decodePngRgba8 } from "./png";

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function resultLabelInkHeight(
  png: Uint8Array<ArrayBuffer>,
  result: number,
): Promise<number> {
  const decoded = await decodePngRgba8(png);
  const label = projectPolyhedralGeometryV4(
    D20_STANDARD_GEOMETRY_R2_V4,
    result,
  ).visibleFaces
    .flatMap((face) => face.labels)
    .find(({ value }) => value === result);
  if (label === undefined) throw new Error("D20 result label is missing");

  const centerX = label.origin[0] * decoded.width;
  const centerY = label.origin[1] * decoded.height;
  const candidates = new Set<number>();
  for (
    let y = Math.floor(centerY - 60);
    y <= Math.ceil(centerY + 60);
    y += 1
  ) {
    for (
      let x = Math.floor(centerX - 70);
      x <= Math.ceil(centerX + 70);
      x += 1
    ) {
      const offset = (y * decoded.width + x) * 4;
      const red = decoded.pixels[offset];
      const green = decoded.pixels[offset + 1];
      const blue = decoded.pixels[offset + 2];
      const alpha = decoded.pixels[offset + 3];
      if (
        red === undefined ||
        green === undefined ||
        blue === undefined ||
        alpha === undefined
      ) {
        throw new Error("D20 result label pixel is missing");
      }
      if (red > 220 && green > 220 && blue > 220 && alpha > 200) {
        candidates.add(y * decoded.width + x);
      }
    }
  }

  const heights: number[] = [];
  while (candidates.size > 0) {
    const start = candidates.values().next().value as number;
    candidates.delete(start);
    const pending = [start];
    const component = [start];
    while (pending.length > 0) {
      const point = pending.pop() as number;
      const x = point % decoded.width;
      const y = Math.floor(point / decoded.width);
      for (let nextY = y - 1; nextY <= y + 1; nextY += 1) {
        for (let nextX = x - 1; nextX <= x + 1; nextX += 1) {
          const next = nextY * decoded.width + nextX;
          if (candidates.delete(next)) {
            pending.push(next);
            component.push(next);
          }
        }
      }
    }
    if (component.length < 100) continue;
    const componentX = component.map((point) => point % decoded.width);
    const componentY = component.map((point) =>
      Math.floor(point / decoded.width),
    );
    if (
      Math.abs(
        (Math.min(...componentX) + Math.max(...componentX)) / 2 - centerX,
      ) < 55 &&
      Math.abs(
        (Math.min(...componentY) + Math.max(...componentY)) / 2 - centerY,
      ) < 45
    ) {
      heights.push(Math.max(...componentY) - Math.min(...componentY) + 1);
    }
  }
  if (heights.length === 0) throw new Error("D20 result label ink is missing");
  return Math.max(...heights);
}

function resultDie(
  fontId: FontIdV4,
  engravingFinish: EngravingFinishV4,
  result: number,
) {
  return {
    kind: "polyhedral" as const,
    geometry: D20_STANDARD_GEOMETRY_R2_V4,
    result,
    fontId,
    engravingFinish,
    renderPolicy: "d20-r3" as const,
  };
}

function resultGroup(
  fontId: FontIdV4,
  engravingFinish: EngravingFinishV4,
  firstResult: number,
) {
  return Array.from({ length: 10 }, (_, index) =>
    resultDie(fontId, engravingFinish, firstResult + index),
  );
}

describe("CanvasKit V4 r3 d20 containment", () => {
  it("couples the additive geometry and render policy fail closed", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = new CanvasKitGeometryRendererV4({
      canvasKit,
      defaultFontId: "liberation-sans",
      fontDataById: CANVASKIT_FONT_DATA_V4,
    });

    try {
      await expect(
        renderer.render({
          geometry: D20_STANDARD_GEOMETRY_R2_V4,
          result: 20,
          size: 150,
        }),
      ).rejects.toThrow(
        "CanvasKit V4 d20-standard-r2 requires d20 r3 or standard r4/r5/r6/r7 render policy",
      );
      await expect(
        renderer.render({
          geometry: D20_STANDARD_GEOMETRY_V4,
          result: 20,
          size: 150,
          renderPolicy: "d20-r3",
        }),
      ).rejects.toThrow(
        "CanvasKit V4 d20 r3 render policy requires d20-standard-r2",
      );
      await expect(
        renderer.render({
          geometry: D20_STANDARD_GEOMETRY_V4,
          result: 20,
          size: 150,
          renderPolicy: "invalid" as "legacy",
        }),
      ).rejects.toThrow("CanvasKit V4 polyhedral render policy is invalid");
    } finally {
      renderer.dispose();
    }
  });

  it("pins the approved delivery-size review row", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = new CanvasKitGeometryRendererV4({
      canvasKit,
      defaultFontId: "liberation-sans",
      fontDataById: CANVASKIT_FONT_DATA_V4,
    });

    try {
      const rendered = await renderer.renderGeometryGrid({
        groups: [
          [
            resultDie("new-rocker", "matte-ink", 7),
            resultDie("special-elite", "matte-ink", 20),
            resultDie("liberation-sans", "matte-ink", 15),
          ],
        ],
      });
      expect(await sha256(rendered.png)).toBe(
        APPROVED_D20_R3_REVIEW_PNG_SHA256_V4,
      );
    } finally {
      renderer.dispose();
    }
  });

  it("preserves the frozen r3 orientation-marked result pixels", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = new CanvasKitGeometryRendererV4({
      canvasKit,
      defaultFontId: "liberation-sans",
      fontDataById: CANVASKIT_FONT_DATA_V4,
    });

    try {
      for (const result of [6, 9] as const) {
        const rendered = await renderer.render({
          geometry: D20_STANDARD_GEOMETRY_R2_V4,
          result,
          size: 600,
          engravingColor: "#ffffff",
          renderPolicy: "d20-r3",
        });
        expect(await sha256(rendered.png)).toBe(
          APPROVED_D20_R3_ORIENTATION_MARK_PNG_SHA256_V4[result],
        );
      }
    } finally {
      renderer.dispose();
    }
  });

  it("normalizes r4 d20 labels to one visual type size", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = new CanvasKitGeometryRendererV4({
      canvasKit,
      defaultFontId: "liberation-sans",
      fontDataById: CANVASKIT_FONT_DATA_V4,
    });

    try {
      const heights: number[] = [];
      for (const result of [6, 9, 20]) {
        const rendered = await renderer.render({
          geometry: D20_STANDARD_GEOMETRY_R2_V4,
          result,
          size: 600,
          engravingColor: "#ffffff",
          renderPolicy: "standard-r4",
        });
        heights.push(await resultLabelInkHeight(rendered.png, result));
      }
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(3);
    } finally {
      renderer.dispose();
    }
  });

  it("keeps every result, font, and engraving finish clear at delivery size", async () => {
    const canvasKit = await loadCanvasKitV4();
    const renderer = new CanvasKitGeometryRendererV4({
      canvasKit,
      defaultFontId: "liberation-sans",
      fontDataById: CANVASKIT_FONT_DATA_V4,
    });

    try {
      for (const fontId of FONT_IDS_V4) {
        for (const engravingFinish of ENGRAVING_FINISHES_V4) {
          const options = {
            groups: [
              resultGroup(fontId, engravingFinish, 1),
              resultGroup(fontId, engravingFinish, 11),
            ],
          };
          const rendered = await renderer.renderGeometryGrid(options);
          expect(rendered).toMatchObject({
            width: 1_500,
            height: 300,
            diceCount: 20,
            rowCount: 2,
          });
          expect([...rendered.png.slice(0, 8)]).toEqual([
            137, 80, 78, 71, 13, 10, 26, 10,
          ]);
        }
      }
      const maximumOptions = {
        groups: Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 10 }, (_, column) =>
            resultDie(
              "liberation-sans",
              "matte-ink",
              ((row * 10 + column) % 20) + 1,
            ),
          ),
        ),
      };
      const maximum = await renderer.renderGeometryGrid(maximumOptions);
      const repeatedMaximum = await renderer.renderGeometryGrid(maximumOptions);
      expect(maximum).toMatchObject({
        width: 1_500,
        height: 750,
        diceCount: 50,
        rowCount: 5,
      });
      expect(repeatedMaximum.png).toEqual(maximum.png);
      expect(canvasKit.HEAPU8.buffer.byteLength).toBe(
        CANVASKIT_INITIAL_MEMORY_BYTES_V4,
      );
    } finally {
      renderer.dispose();
    }
  }, 30_000);
});
