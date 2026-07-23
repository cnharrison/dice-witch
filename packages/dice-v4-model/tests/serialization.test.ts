import { describe, expect, it } from "vitest";
import {
  MAX_RENDER_REQUEST_JSON_CHARACTERS_V4,
  parsePublicRenderModelV4,
  parseRenderRequestV4Json,
  serializeRenderRequestV4,
  type RenderDieV4,
  type RenderRequestV4,
} from "../src";

function die(): RenderDieV4 {
  return {
    target: "d20",
    result: 20,
    form: "sharp",
    appearance: {
      material: {
        family: "sharp-resin",
        style: "layered",
        inclusion: "botanical",
        clarity: 100,
        inclusionDensity: 100,
        finish: "polished",
        textureScale: 400,
      },
      palette: [
        "#000000",
        "#333333",
        "#666666",
        "#999999",
        "#cccccc",
        "#ffffff",
      ],
      texture: {
        generatorId: "sharp-resin-v1",
        seed: 0xffff_ffff,
        scale: 400,
        rotation: 359,
        offsetU: 65_535,
        offsetV: 65_535,
      },
      lighting: {
        mode: "combined",
        strength: "strong",
        direction: "upper-right",
      },
      engraving: {
        fontId: "fontdiner-swanky",
        finish: "luminous",
        color: "#FFFFFF",
      },
      outlineColor: "#000000",
      requiresLocalSeparation: true,
      effect: {
        state: "critical-failure",
        treatment: "internal-flare",
        color: "#FF3333",
        intensity: 100,
      },
    },
    icons: ["critical-failure", "explosion", "recycle"],
  };
}

function request(groups: RenderDieV4[][] = [[die()]]): RenderRequestV4 {
  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r1",
    groups,
  };
}

describe("V4 snapshot serialization", () => {
  it("round-trips one canonical representation", () => {
    const serialized = serializeRenderRequestV4(request());
    expect(serialized).toBe(serializeRenderRequestV4(request()));
    expect(serialized).toContain('"color":"#ffffff"');
    expect(serialized).not.toContain("#FFFFFF");
    expect(parseRenderRequestV4Json(serialized)).toEqual(
      parsePublicRenderModelV4(request()),
    );
  });

  it("preserves scope-free r1 bytes and explicit later-revision scope", () => {
    const revision1 = serializeRenderRequestV4(request());
    expect(revision1).not.toContain('"scope"');

    const revision2 = request();
    revision2.rendererRevision = "canvaskit-v4-r2";
    const revision2Die = revision2.groups[0]?.[0];
    if (revision2Die === undefined) throw new Error("Test die is missing");
    revision2Die.appearance.texture.scope = "die-wide";
    const serialized = serializeRenderRequestV4(revision2);
    expect(serialized).toContain('"scope":"die-wide"');
    expect(parseRenderRequestV4Json(serialized)).toEqual(
      parsePublicRenderModelV4(revision2),
    );

    const revision3 = structuredClone(revision2);
    revision3.rendererRevision = "canvaskit-v4-r3";
    const serialized3 = serializeRenderRequestV4(revision3);
    expect(serialized3).toContain('"scope":"die-wide"');
    expect(parseRenderRequestV4Json(serialized3)).toEqual(
      parsePublicRenderModelV4(revision3),
    );

    const revision4 = structuredClone(revision2);
    revision4.rendererRevision = "canvaskit-v4-r4";
    const serialized4 = serializeRenderRequestV4(revision4);
    expect(serialized4).toContain('"scope":"die-wide"');
    expect(parseRenderRequestV4Json(serialized4)).toEqual(
      parsePublicRenderModelV4(revision4),
    );

    const revision5 = structuredClone(revision2);
    revision5.rendererRevision = "canvaskit-v4-r5";
    const serialized5 = serializeRenderRequestV4(revision5);
    expect(serialized5).toContain('"scope":"die-wide"');
    expect(parseRenderRequestV4Json(serialized5)).toEqual(
      parsePublicRenderModelV4(revision5),
    );

    const revision6 = structuredClone(revision2);
    revision6.rendererRevision = "canvaskit-v4-r6";
    const serialized6 = serializeRenderRequestV4(revision6);
    expect(serialized6).toContain('"scope":"die-wide"');
    expect(parseRenderRequestV4Json(serialized6)).toEqual(
      parsePublicRenderModelV4(revision6),
    );

    const revision7 = structuredClone(revision2);
    revision7.rendererRevision = "canvaskit-v4-r7";
    const serialized7 = serializeRenderRequestV4(revision7);
    expect(serialized7).toContain('"scope":"die-wide"');
    expect(parseRenderRequestV4Json(serialized7)).toEqual(
      parsePublicRenderModelV4(revision7),
    );
  });

  it("keeps the maximum 50-die public model inside its JSON bound", () => {
    const maximum = request([Array.from({ length: 50 }, () => die())]);
    const serialized = serializeRenderRequestV4(maximum);
    expect(serialized.length).toBeLessThanOrEqual(
      MAX_RENDER_REQUEST_JSON_CHARACTERS_V4,
    );
    expect(parsePublicRenderModelV4(maximum).groups[0]).toHaveLength(50);
  });

  it("rejects malformed, oversized, and older serialized models", () => {
    expect(() => parseRenderRequestV4Json("not-json")).toThrow(
      "Render request V4 JSON is invalid",
    );
    expect(() =>
      parseRenderRequestV4Json(
        "x".repeat(MAX_RENDER_REQUEST_JSON_CHARACTERS_V4 + 1),
      ),
    ).toThrow("Render request V4 JSON exceeds 98304 characters");
    expect(() =>
      parsePublicRenderModelV4({ version: 3, groups: [[die()]] }),
    ).toThrow("Render request V4 has invalid fields");
  });
});
