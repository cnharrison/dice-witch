import { describe, expect, it } from "vitest";
import {
  CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4,
  R32_FONT_IDS_V4,
  R37_FONT_IDS_V4,
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  getAuthoredRenderViewV4,
  validateRenderRequestV4,
  type AppearanceMaterialV4,
  type RenderDieV4,
  type RenderRequestV4,
  type TextureScopeV4,
} from "../src";

const materials: AppearanceMaterialV4[] = [
  {
    family: "classic",
    treatment: "solid",
    opacity: "opaque",
    finish: "satin",
    textureScale: 100,
  },
  {
    family: "sharp-resin",
    style: "clear",
    inclusion: "foil",
    clarity: 85,
    inclusionDensity: 35,
    finish: "polished",
    textureScale: 120,
  },
  {
    family: "liquid-core",
    core: "cosmic",
    clarity: 90,
    particleDensity: 45,
    finish: "polished",
    textureScale: 110,
  },
  {
    family: "gemstone",
    stone: "jade",
    veinDensity: 55,
    finish: "polished",
    textureScale: 130,
  },
  {
    family: "glass",
    style: "prismatic",
    clarity: 95,
    finish: "etched",
    textureScale: 100,
  },
  {
    family: "stone",
    stone: "granite",
    grainDensity: 65,
    finish: "honed",
    textureScale: 90,
  },
  {
    family: "metal",
    metal: "brass",
    finish: "brushed",
    patinaStrength: 20,
    textureScale: 100,
  },
  {
    family: "hollow-metal",
    construction: "filigree",
    metal: "silver",
    finish: "polished",
    openness: 60,
    textureScale: 100,
  },
  {
    family: "wood",
    wood: "burl",
    finish: "lacquered",
    grainDensity: 75,
    textureScale: 150,
  },
  {
    family: "fantasy",
    essence: "void",
    intensity: 80,
    finish: "radiant",
    textureScale: 140,
  },
];

const r32Materials: AppearanceMaterialV4[] = [
  {
    family: "elemental",
    style: "lava",
    fissureDensity: 65,
    glowIntensity: 78,
    textureScale: 110,
  },
  {
    family: "elemental",
    style: "sand",
    grainSize: 78,
    windDirection: -10,
    textureScale: 150,
  },
  {
    family: "elemental",
    style: "blue-sky",
    cloudCover: 58,
    horizonHeight: 48,
    textureScale: 240,
  },
  {
    family: "elemental",
    style: "sunset",
    cloudCover: 68,
    horizonHeight: 62,
    textureScale: 255,
  },
  {
    family: "paint",
    style: "splatter",
    dropDensity: 64,
    streakLength: 56,
    textureScale: 130,
  },
];

function formFor(material: AppearanceMaterialV4): RenderDieV4["form"] {
  if (material.family === "hollow-metal") return "hollow-cage";
  if (["gemstone", "glass", "fantasy"].includes(material.family)) {
    return "crystal-cut";
  }
  return "standard";
}

function die(
  material: AppearanceMaterialV4 = materials[0] as AppearanceMaterialV4,
): RenderDieV4 {
  const family = material.family;
  return {
    target: "d20",
    result: 20,
    form: formFor(material),
    appearance: {
      material,
      palette: ["#123456", "#abcdef"],
      texture: {
        generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[family],
        seed: 0x51ce_b00c,
        scale: material.textureScale,
        rotation: 315,
        offsetU: 12_345,
        offsetV: 54_321,
      },
      lighting: {
        mode: "combined",
        strength: "gentle",
        direction: "upper-left",
      },
      engraving: {
        fontId: "liberation-sans",
        finish: "matte-ink",
        color: "#faf9f6",
      },
      outlineColor: "#000000",
      requiresLocalSeparation: false,
      effect: {
        state: "critical-success",
        treatment: CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4[family],
        color: "#ffcc00",
        intensity: 40,
      },
    },
    icons: ["critical-success"],
  };
}

function requestWithDie(value: unknown): unknown {
  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r1",
    groups: [[value]],
  };
}

function validRequest(): RenderRequestV4 {
  return requestWithDie(die()) as RenderRequestV4;
}

function revision2Request(
  value: RenderDieV4 = die(),
  scope: TextureScopeV4 = "die-wide",
) {
  const snapshot = structuredClone(value);
  Object.assign(snapshot.appearance.texture, {
    scope,
    ...(scope === "face-local" ? { offsetU: 0, offsetV: 0 } : {}),
  });
  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r2",
    groups: [[snapshot]],
  };
}

describe("RenderRequestV4", () => {
  it("accepts adaptive outlines only for non-hollow polyhedra from r39", () => {
    const material = materials[5];
    if (material === undefined) throw new Error("Outline test material is missing");
    const adaptive = revision2Request({
      ...die(material),
      view: getAuthoredRenderViewV4("canvaskit-v4-r39", "legacy", {
        target: "d20",
        result: 20,
        form: "standard",
      }),
    });
    adaptive.rendererRevision = "canvaskit-v4-r39";
    const adaptiveAppearance = adaptive.groups[0]?.[0]?.appearance;
    if (adaptiveAppearance === undefined) {
      throw new Error("Adaptive outline test appearance is missing");
    }
    Object.assign(adaptiveAppearance, { outlineColor: "#ffffff" });

    expect(validateRenderRequestV4(adaptive)).toEqual(adaptive);

    const historical = structuredClone(adaptive);
    historical.rendererRevision = "canvaskit-v4-r38";
    expect(() => validateRenderRequestV4(historical)).toThrow(
      "Render request groups[0][0].appearance.outlineColor must be #000000 before r39",
    );

    const sphere = structuredClone(adaptive);
    const sphereDie = sphere.groups[0]?.[0];
    if (sphereDie === undefined) throw new Error("Sphere test die is missing");
    Object.assign(sphereDie, {
      target: "other",
      sides: 20,
      form: "sphere",
      view: getAuthoredRenderViewV4("canvaskit-v4-r39", "legacy", {
        target: "other",
        result: 20,
        form: "sphere",
      }),
    });
    expect(() => validateRenderRequestV4(sphere)).toThrow(
      "Render request groups[0][0].appearance.outlineColor must be #000000 for sphere",
    );

    const hollowMaterial = materials[7];
    if (hollowMaterial === undefined) {
      throw new Error("Hollow outline test material is missing");
    }
    const hollowDie = die(hollowMaterial);
    const hollow = revision2Request({
      ...hollowDie,
      appearance: {
        ...hollowDie.appearance,
        outlineColor: "#ffffff",
      },
      view: getAuthoredRenderViewV4("canvaskit-v4-r39", "legacy", {
        target: "d20",
        result: 20,
        form: "hollow-cage",
      }),
    });
    hollow.rendererRevision = "canvaskit-v4-r39";
    expect(() => validateRenderRequestV4(hollow)).toThrow(
      "Render request groups[0][0].appearance.outlineColor must be #000000 for hollow-cage",
    );

    Object.assign(adaptiveAppearance, { outlineColor: "#ff0000" });
    expect(() => validateRenderRequestV4(adaptive)).toThrow(
      "Render request groups[0][0].appearance.outlineColor must be #000000 or #ffffff",
    );
  });

  it("accepts percentile-ones labels only on d10 dice and preserves omitted labels", () => {
    const d10 = {
      ...die(),
      target: "d10",
      result: 10,
      faceLabelSet: "percentile-ones",
    };
    expect(validateRenderRequestV4(requestWithDie(d10))).toEqual(
      requestWithDie(d10),
    );

    const historicalD10 = { ...d10 };
    delete (historicalD10 as { faceLabelSet?: unknown }).faceLabelSet;
    expect(validateRenderRequestV4(requestWithDie(historicalD10))).toEqual(
      requestWithDie(historicalD10),
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...die(), faceLabelSet: "percentile-ones" }),
      ),
    ).toThrow("groups[0][0].faceLabelSet is invalid for d20");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...d10, faceLabelSet: "native" }),
      ),
    ).toThrow("groups[0][0].faceLabelSet is not supported");
  });

  it("requires resolved camera angles only for the camera revision", () => {
    const legacy = validRequest();
    expect(validateRenderRequestV4(legacy)).toEqual(legacy);

    const currentDie = die();
    currentDie.appearance.texture.scope = "die-wide";
    currentDie.view = {
      kind: "camera",
      elevationDegrees: 40,
      azimuthOffsetDegrees: -10,
      poseAzimuthDegrees: 0,
    };
    const current = {
      version: 4,
      rendererRevision: "canvaskit-v4-r16",
      groups: [[currentDie]],
    } as const;
    expect(validateRenderRequestV4(current)).toEqual(current);

    const missingView = structuredClone(current);
    delete (missingView.groups[0][0] as { view?: unknown }).view;
    expect(() => validateRenderRequestV4(missingView)).toThrow(
      "Render request groups[0][0] has invalid fields",
    );

    const invalidPose = structuredClone(current);
    const invalidPoseView = invalidPose.groups[0][0].view;
    if (invalidPoseView?.kind !== "camera") {
      throw new Error("Current camera fixture is invalid");
    }
    invalidPoseView.poseAzimuthDegrees = 120;
    expect(() => validateRenderRequestV4(invalidPose)).toThrow(
      "Render request groups[0][0].view.poseAzimuthDegrees is invalid",
    );

    const realistic = {
      ...structuredClone(current),
      rendererRevision: "canvaskit-v4-r17" as const,
    };
    const realisticView = realistic.groups[0][0].view;
    if (realisticView === undefined || realisticView.kind !== "camera") {
      throw new Error("Realistic camera fixture is invalid");
    }
    realisticView.azimuthOffsetDegrees = 45;
    realisticView.poseAzimuthDegrees = 180;
    expect(validateRenderRequestV4(realistic)).toEqual(realistic);

    const azimuths = [-45, -35, -25, -15, -5, 5, 15, 25, 35, 45];
    const poses = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
    for (const [index, azimuthOffsetDegrees] of azimuths.entries()) {
      const preset = structuredClone(realistic);
      const presetView = preset.groups[0][0].view;
      if (presetView === undefined || presetView.kind !== "camera") {
        throw new Error("Camera preset fixture is invalid");
      }
      const poseAzimuthDegrees = poses[index];
      if (poseAzimuthDegrees === undefined) {
        throw new Error("Pose preset fixture is missing");
      }
      presetView.azimuthOffsetDegrees = azimuthOffsetDegrees;
      presetView.poseAzimuthDegrees = poseAzimuthDegrees;
      expect(validateRenderRequestV4(preset)).toEqual(preset);
    }
  });

  it("accepts fully resolved d6 authored camera views in r20 and r21", () => {
    const authoredDie: RenderDieV4 = {
      ...die(),
      target: "d6",
      result: 6,
      form: "standard",
      view: getAuthoredRenderViewV4("canvaskit-v4-r20", "legacy", {
        target: "d6",
        form: "standard",
        result: 6,
      }),
    };
    authoredDie.appearance.texture.scope = "die-wide";
    const authored = {
      version: 4,
      rendererRevision: "canvaskit-v4-r20",
      groups: [[authoredDie]],
    } as const;

    expect(validateRenderRequestV4(authored)).toEqual(authored);
    const revision21 = {
      ...structuredClone(authored),
      rendererRevision: "canvaskit-v4-r21" as const,
      groups: [[
        {
          ...authoredDie,
          view: getAuthoredRenderViewV4(
            "canvaskit-v4-r21",
            "legacy",
            { target: "d6", form: "standard", result: 6 },
          ),
        },
      ]],
    };
    expect(validateRenderRequestV4(revision21)).toEqual(revision21);
    const revision23 = {
      ...structuredClone(authored),
      rendererRevision: "canvaskit-v4-r23" as const,
      groups: [[
        {
          ...authoredDie,
          view: getAuthoredRenderViewV4(
            "canvaskit-v4-r23",
            "legacy",
            { target: "d6", form: "standard", result: 6 },
          ),
        },
      ]],
    };
    expect(validateRenderRequestV4(revision23)).toEqual(revision23);

    const previousRevision = {
      ...structuredClone(authored),
      rendererRevision: "canvaskit-v4-r19" as const,
    };
    expect(() => validateRenderRequestV4(previousRevision)).toThrow(
      "Render request groups[0][0].view is invalid for d6",
    );

    const unauthoredTarget = {
      ...structuredClone(authored),
      groups: [[{ ...authoredDie, target: "d20", result: 20 }]],
    };
    expect(() => validateRenderRequestV4(unauthoredTarget)).toThrow(
      "Render request groups[0][0].view does not match an authored d20 view",
    );

    const nonUnitRotation = structuredClone(authored);
    const view = nonUnitRotation.groups[0][0].view;
    if (view?.kind !== "oriented-camera") {
      throw new Error("Authored camera fixture is invalid");
    }
    view.resultRotation = [0, 0, 0, 2];
    expect(() => validateRenderRequestV4(nonUnitRotation)).toThrow(
      "Render request groups[0][0].view.resultRotation must be normalized",
    );

    const wrongResultRotation = structuredClone(authored);
    const wrongView = wrongResultRotation.groups[0][0].view;
    if (wrongView?.kind !== "oriented-camera") {
      throw new Error("Authored camera fixture is invalid");
    }
    wrongView.resultRotation = [0, 0, 1, 0];
    expect(() => validateRenderRequestV4(wrongResultRotation)).toThrow(
      "Render request groups[0][0].view does not match an authored d6 view",
    );
  });

  it("keeps r20 and r21 d20 Clear snapshots revision-specific", () => {
    const d20 = die();
    d20.appearance.texture.scope = "die-wide";
    d20.view = getAuthoredRenderViewV4(
      "canvaskit-v4-r20",
      "clear",
      { target: "d20", form: "standard", result: d20.result },
    );
    const requestR20 = {
      version: 4,
      rendererRevision: "canvaskit-v4-r20",
      groups: [[d20]],
    } as const;
    expect(validateRenderRequestV4(requestR20)).toEqual(requestR20);

    expect(() =>
      validateRenderRequestV4({
        ...structuredClone(requestR20),
        rendererRevision: "canvaskit-v4-r21",
      }),
    ).toThrow(
      "Render request groups[0][0].view does not match an authored d20 view",
    );
  });

  it("keeps r21 and r22 d20 Legacy snapshots revision-specific", () => {
    const d20 = die();
    d20.appearance.texture.scope = "die-wide";
    d20.view = getAuthoredRenderViewV4(
      "canvaskit-v4-r21",
      "legacy",
      { target: "d20", form: "standard", result: d20.result },
    );
    const requestR21 = {
      version: 4,
      rendererRevision: "canvaskit-v4-r21",
      groups: [[d20]],
    } as const;
    expect(validateRenderRequestV4(requestR21)).toEqual(requestR21);
    expect(() =>
      validateRenderRequestV4({
        ...structuredClone(requestR21),
        rendererRevision: "canvaskit-v4-r22",
      }),
    ).toThrow(
      "Render request groups[0][0].view does not match an authored d20 view",
    );
  });

  it("accepts bounded preference cameras in r20, r21, and r22", () => {
    const preferenceDie = die();
    preferenceDie.appearance.texture.scope = "die-wide";
    preferenceDie.view = {
      kind: "camera",
      elevationDegrees: 55,
      azimuthOffsetDegrees: 0,
      poseAzimuthDegrees: 180,
    };
    const preference = {
      version: 4,
      rendererRevision: "canvaskit-v4-r20",
      groups: [[preferenceDie]],
    } as const;

    expect(validateRenderRequestV4(preference)).toEqual(preference);
    for (const rendererRevision of [
      "canvaskit-v4-r21",
      "canvaskit-v4-r22",
      "canvaskit-v4-r23",
    ] as const) {
      expect(
        validateRenderRequestV4({
          ...structuredClone(preference),
          rendererRevision,
        }),
      ).toMatchObject({ rendererRevision });
    }
    expect(() =>
      validateRenderRequestV4({
        ...structuredClone(preference),
        rendererRevision: "canvaskit-v4-r19",
      }),
    ).toThrow("Render request groups[0][0].view.elevationDegrees is invalid");

    for (const [field, value] of [
      ["elevationDegrees", 29],
      ["elevationDegrees", 55.5],
      ["azimuthOffsetDegrees", 46],
      ["azimuthOffsetDegrees", 3],
      ["poseAzimuthDegrees", 5],
    ] as const) {
      const invalid = structuredClone(preference);
      const view = invalid.groups[0][0].view;
      if (view?.kind !== "camera") {
        throw new Error("Camera preference fixture is invalid");
      }
      view[field] = value;
      expect(() => validateRenderRequestV4(invalid)).toThrow(
        `Render request groups[0][0].view.${field} is invalid`,
      );
    }
  });

  it("accepts and canonicalizes every material family", () => {
    for (const material of materials) {
      const parsed = validateRenderRequestV4(requestWithDie(die(material)));
      const parsedDie = parsed.groups[0]?.[0];
      expect(parsedDie?.appearance.material).toEqual(material);
      expect(parsedDie?.appearance.texture.generatorId).toBe(
        TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[material.family],
      );
      expect(parsedDie?.appearance.effect?.treatment).toBe(
        CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4[material.family],
      );
    }

    const uppercase = validRequest();
    const uppercaseDie = uppercase.groups[0]?.[0];
    if (uppercaseDie === undefined) throw new Error("Test die is missing");
    uppercaseDie.appearance.palette = ["#ABCDEF", "#123456"];
    expect(
      validateRenderRequestV4(uppercase).groups[0]?.[0]?.appearance.palette,
    ).toEqual(["#abcdef", "#123456"]);
  });

  it("gates additive fonts and materials to their renderer revisions", () => {
    for (const material of r32Materials) {
      const candidate = die(material);
      candidate.appearance.texture.scope = "die-wide";
      candidate.view = getAuthoredRenderViewV4("canvaskit-v4-r32", "legacy", {
        target: candidate.target,
        result: candidate.result,
        form: candidate.form,
      });
      const request = {
        version: 4,
        rendererRevision: "canvaskit-v4-r32",
        groups: [[candidate]],
      };
      expect(validateRenderRequestV4(request).groups[0]?.[0]?.appearance.material)
        .toEqual(material);
      expect(() =>
        validateRenderRequestV4({
          ...request,
          rendererRevision: "canvaskit-v4-r31",
        }),
      ).toThrow("appearance.material is not supported before r32");
    }

    for (const fontId of R32_FONT_IDS_V4) {
      const candidate = die();
      candidate.appearance.texture.scope = "die-wide";
      candidate.appearance.palette = ["#0f172a", "#0f172a"];
      candidate.appearance.engraving.fontId = fontId;
      candidate.view = getAuthoredRenderViewV4("canvaskit-v4-r32", "legacy", {
        target: candidate.target,
        result: candidate.result,
        form: candidate.form,
      });
      const request = {
        version: 4,
        rendererRevision: "canvaskit-v4-r32",
        groups: [[candidate]],
      };
      expect(validateRenderRequestV4(request).groups[0]?.[0]?.appearance.engraving.fontId)
        .toBe(fontId);
      expect(() =>
        validateRenderRequestV4({
          ...request,
          rendererRevision: "canvaskit-v4-r31",
        }),
      ).toThrow("appearance.engraving.fontId is not supported before r32");
    }

    for (const fontId of R37_FONT_IDS_V4) {
      const candidate = die();
      candidate.appearance.texture.scope = "die-wide";
      candidate.appearance.palette = ["#0f172a", "#0f172a"];
      candidate.appearance.engraving.fontId = fontId;
      candidate.view = getAuthoredRenderViewV4("canvaskit-v4-r37", "legacy", {
        target: candidate.target,
        result: candidate.result,
        form: candidate.form,
      });
      const request = {
        version: 4,
        rendererRevision: "canvaskit-v4-r37",
        groups: [[candidate]],
      };
      expect(validateRenderRequestV4(request).groups[0]?.[0]?.appearance.engraving.fontId)
        .toBe(fontId);
      expect(() =>
        validateRenderRequestV4({
          ...request,
          rendererRevision: "canvaskit-v4-r36",
        }),
      ).toThrow("appearance.engraving.fontId is not supported before r37");
    }
  });

  it("keeps r1 scope-free and requires explicit texture scope in later revisions", () => {
    const r1 = validateRenderRequestV4(validRequest());
    expect(r1.groups[0]?.[0]?.appearance.texture).not.toHaveProperty("scope");
    for (const rendererRevision of [
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
    ] as const) {
      expect(() =>
        validateRenderRequestV4({
          ...validRequest(),
          rendererRevision,
        }),
      ).toThrow("appearance.texture has invalid fields");
    }
    expect(() =>
      validateRenderRequestV4({
        ...revision2Request(),
        rendererRevision: "canvaskit-v4-r1",
      }),
    ).toThrow("appearance.texture has invalid fields");

    const dieWide = validateRenderRequestV4(revision2Request());
    const revision3 = revision2Request();
    revision3.rendererRevision = "canvaskit-v4-r3";
    const dieWideR3 = validateRenderRequestV4(revision3);
    const revision4 = revision2Request();
    revision4.rendererRevision = "canvaskit-v4-r4";
    const dieWideR4 = validateRenderRequestV4(revision4);
    const revision5 = revision2Request();
    revision5.rendererRevision = "canvaskit-v4-r5";
    const dieWideR5 = validateRenderRequestV4(revision5);
    const revision6 = revision2Request();
    revision6.rendererRevision = "canvaskit-v4-r6";
    const dieWideR6 = validateRenderRequestV4(revision6);
    const revision7 = revision2Request();
    revision7.rendererRevision = "canvaskit-v4-r7";
    const dieWideR7 = validateRenderRequestV4(revision7);
    const revision8 = revision2Request();
    revision8.rendererRevision = "canvaskit-v4-r8";
    const dieWideR8 = validateRenderRequestV4(revision8);
    const faceLocal = validateRenderRequestV4(
      revision2Request(
        die({
          family: "classic",
          treatment: "gradient",
          opacity: "opaque",
          finish: "satin",
          textureScale: 100,
        }),
        "face-local",
      ),
    );
    expect(dieWide.groups[0]?.[0]?.appearance.texture.scope).toBe("die-wide");
    expect(dieWideR3.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR4.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR5.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR6.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR7.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR8.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(faceLocal.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "face-local",
    );
  });

  it("bounds face-local scope to zero-offset standard polyhedral classic gradients", () => {
    const gradient = die({
      family: "classic",
      treatment: "gradient",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    });
    const offset = revision2Request(gradient, "face-local");
    const offsetDie = offset.groups[0]?.[0];
    if (offsetDie === undefined) throw new Error("Test die is missing");
    offsetDie.appearance.texture.offsetU = 1;
    expect(() => validateRenderRequestV4(offset)).toThrow(
      "face-local texture scope does not support offsets",
    );

    const pattern = die({
      family: "classic",
      treatment: "pattern",
      patternId: "checkerboard",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    });
    expect(() =>
      validateRenderRequestV4(revision2Request(pattern, "face-local")),
    ).toThrow("face-local texture scope requires classic gradient material");

    const solid = die({
      family: "classic",
      treatment: "solid",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    });
    const r27Solid = revision2Request(solid, "face-local");
    r27Solid.rendererRevision = "canvaskit-v4-r27";
    const r27Die = r27Solid.groups[0]?.[0];
    if (r27Die === undefined) throw new Error("r27 test die is missing");
    Object.assign(r27Die, {
      view: getAuthoredRenderViewV4(
        "canvaskit-v4-r27",
        "legacy",
        { target: "d20", form: "standard", result: 20 },
      ),
    });
    expect(validateRenderRequestV4(r27Solid)).toEqual(r27Solid);
    const r26Solid = structuredClone(r27Solid);
    r26Solid.rendererRevision = "canvaskit-v4-r26";
    expect(() => validateRenderRequestV4(r26Solid)).toThrow(
      "face-local texture scope requires classic gradient material",
    );

    const r29Bounded = revision2Request(solid, "bounded-die-wide");
    r29Bounded.rendererRevision = "canvaskit-v4-r29";
    const r29Die = r29Bounded.groups[0]?.[0];
    if (r29Die === undefined) throw new Error("r29 test die is missing");
    Object.assign(r29Die, {
      view: getAuthoredRenderViewV4(
        "canvaskit-v4-r29",
        "legacy",
        { target: "d20", form: "standard", result: 20 },
      ),
    });
    expect(validateRenderRequestV4(r29Bounded)).toEqual(r29Bounded);
    const r28Bounded = structuredClone(r29Bounded);
    r28Bounded.rendererRevision = "canvaskit-v4-r28";
    expect(() => validateRenderRequestV4(r28Bounded)).toThrow(
      "bounded die-wide texture scope is not supported",
    );

    const sharp = die({
      family: "classic",
      treatment: "gradient",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    });
    sharp.form = "sharp";
    expect(() =>
      validateRenderRequestV4(revision2Request(sharp, "face-local")),
    ).toThrow("face-local texture scope requires standard form");

    const other = die({
      family: "classic",
      treatment: "gradient",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    });
    const otherValue = {
      ...other,
      target: "other",
      sides: 20,
      form: "sphere",
    };
    expect(() =>
      validateRenderRequestV4(
        revision2Request(otherValue as RenderDieV4, "face-local"),
      ),
    ).toThrow("face-local texture scope is invalid for other");
  });

  it("accepts the authored beech and vine-carved wood contract", () => {
    const material = {
      family: "wood",
      wood: "beech",
      finish: "vine-carved",
      grainDensity: 48,
      textureScale: 100,
    } as const;
    const parsed = validateRenderRequestV4(requestWithDie(die(material)));
    expect(parsed.groups[0]?.[0]?.appearance.material).toEqual(material);
  });

  it("enforces exact request fields, version, non-empty groups, and 50 dice", () => {
    expect(() =>
      validateRenderRequestV4({ ...validRequest(), extra: true }),
    ).toThrow("Render request V4 has invalid fields");
    expect(() =>
      validateRenderRequestV4(
        Object.assign(Object.create({}) as object, validRequest()),
      ),
    ).toThrow("Render request V4 has invalid fields");
    expect(() =>
      validateRenderRequestV4({ ...validRequest(), version: 3 }),
    ).toThrow("Render request version must be 4");
    expect(() =>
      validateRenderRequestV4({ ...validRequest(), groups: [] }),
    ).toThrow("Render request groups must be a non-empty array");
    expect(() =>
      validateRenderRequestV4({ ...validRequest(), groups: [[]] }),
    ).toThrow("Render request groups[0] must be a non-empty array");

    expect(() =>
      validateRenderRequestV4({
        ...validRequest(),
        groups: [Array.from({ length: 50 }, () => die())],
      }),
    ).not.toThrow();
    expect(() =>
      validateRenderRequestV4({
        ...validRequest(),
        groups: [Array.from({ length: 51 }, () => die())],
      }),
    ).toThrow("Render request exceeds 50 dice");
  });

  it("validates target results, Other sides, and form compatibility", () => {
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...die(), target: "d10", result: 1 }),
      ),
    ).not.toThrow();
    for (const result of [0, 11]) {
      expect(() =>
        validateRenderRequestV4(
          requestWithDie({ ...die(), target: "d10", result }),
        ),
      ).toThrow(
        "Render request groups[0][0].result must be from 1 through 10",
      );
    }
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...die(), target: "percentile", result: 85 }),
      ),
    ).toThrow(
      "Render request groups[0][0].result must be a multiple of 10 from 0 through 90",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...die(), target: "fudge", result: 2 }),
      ),
    ).toThrow("Render request groups[0][0].result must be -1, 0, or 1");

    const other = { ...die(), target: "other", sides: 999, result: 999, form: "sphere" };
    expect(() => validateRenderRequestV4(requestWithDie(other))).not.toThrow();
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...other, sides: 1_000, result: 1_000 }),
      ),
    ).toThrow("Render request groups[0][0].sides must be from 1 through 999");
    expect(() =>
      validateRenderRequestV4(requestWithDie({ ...die(), form: "sphere" })),
    ).toThrow("Render request groups[0][0].form is invalid for d20");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...other, form: "standard" }),
      ),
    ).toThrow("Render request groups[0][0].form is invalid for other");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...die(materials[6]), form: "hollow-cage" }),
      ),
    ).toThrow(
      "Render request groups[0][0].form is incompatible with metal material",
    );
    for (const form of ["sharp", "crystal-cut", "hollow-cage"] as const) {
      const material =
        form === "hollow-cage" ? materials[7] : materials[4];
      if (material === undefined) throw new Error("Test material is missing");
      expect(() =>
        validateRenderRequestV4(
          requestWithDie({ ...die(material), target: "d6", result: 6, form }),
        ),
      ).toThrow(
        `Render request groups[0][0].form is not implemented for d6`,
      );
    }
  });

  it("adds non-d20 crystal-cut and hollow-cage forms only in r30", () => {
    for (const [form, material] of [
      ["crystal-cut", materials[4]],
      ["hollow-cage", materials[7]],
    ] as const) {
      if (material === undefined) throw new Error("Test material is missing");
      const value = revision2Request({
        ...die(material),
        target: "d6",
        result: 6,
        form,
        view: getAuthoredRenderViewV4("canvaskit-v4-r30", "legacy", {
          target: "d6",
          result: 6,
          form,
        }),
      });
      value.rendererRevision = "canvaskit-v4-r30";
      expect(validateRenderRequestV4(value)).toEqual(value);

      const historical = structuredClone(value);
      historical.rendererRevision = "canvaskit-v4-r29";
      expect(() => validateRenderRequestV4(historical)).toThrow(
        "Render request groups[0][0].form is not implemented for d6",
      );
    }
  });

  it("accepts a duplicated one-color render palette from r30", () => {
    const value = revision2Request({
      ...die(),
      target: "d6",
      result: 6,
      appearance: { ...die().appearance, palette: ["#d2042d", "#d2042d"] },
      view: getAuthoredRenderViewV4("canvaskit-v4-r30", "legacy", {
        target: "d6",
        result: 6,
        form: "standard",
      }),
    });
    value.rendererRevision = "canvaskit-v4-r30";
    expect(validateRenderRequestV4(value)).toEqual(value);

    const historical = structuredClone(value);
    historical.rendererRevision = "canvaskit-v4-r29";
    expect(() => validateRenderRequestV4(historical)).toThrow(
      "Render request groups[0][0].appearance.palette is invalid",
    );
  });

  it("requires one distinct Classic Solid color in r31", () => {
    const value = revision2Request({
      ...die(),
      target: "d6",
      result: 6,
      view: getAuthoredRenderViewV4("canvaskit-v4-r31", "legacy", {
        target: "d6",
        result: 6,
        form: "standard",
      }),
    });
    value.rendererRevision = "canvaskit-v4-r31";
    expect(() => validateRenderRequestV4(value)).toThrow(
      "Render request groups[0][0].appearance.palette requires one Classic Solid color",
    );

    const appearance = value.groups[0]?.[0]?.appearance;
    if (appearance === undefined) throw new Error("Test appearance is missing");
    appearance.palette = ["#d2042d", "#d2042d"];
    expect(validateRenderRequestV4(value)).toEqual(value);

    const historical = structuredClone(value);
    historical.rendererRevision = "canvaskit-v4-r30";
    const historicalAppearance = historical.groups[0]?.[0]?.appearance;
    if (historicalAppearance === undefined) {
      throw new Error("Historical test appearance is missing");
    }
    historicalAppearance.palette = ["#123456", "#abcdef"];
    expect(validateRenderRequestV4(historical)).toEqual(historical);
  });

  it("rejects invalid material parameters and mismatched renderer assets", () => {
    const base = die(materials[1]);
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            material: { ...base.appearance.material, clarity: 101 },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.material.clarity must be from 0 through 100",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            material: { ...base.appearance.material, extra: true },
          },
        }),
      ),
    ).toThrow("Render request groups[0][0].appearance.material has invalid fields");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            texture: { ...base.appearance.texture, generatorId: "glass-v1" },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.texture.generatorId does not match sharp-resin material",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            texture: { ...base.appearance.texture, scale: 121 },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.texture.scale does not match material textureScale",
    );
    const effect = base.appearance.effect;
    if (effect === null) throw new Error("Test effect is missing");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            effect: { ...effect, treatment: "spectral-rim" },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.effect.treatment does not match sharp-resin material",
    );
  });

  it("keeps critical effects and modifier icons consistent", () => {
    const critical = die();
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...critical,
          appearance: { ...critical.appearance, effect: null },
        }),
      ),
    ).toThrow("critical effect does not match modifier icons");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...critical,
          icons: ["critical-failure"],
        }),
      ),
    ).toThrow("critical effect does not match modifier icons");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...critical,
          icons: ["critical-success", "critical-failure"],
        }),
      ),
    ).toThrow("critical effect does not match modifier icons");
  });

  it("bounds palette, texture, lighting, engraving, and icons", () => {
    const base = die();
    for (const palette of [
      ["#123456"],
      ["#123456", "#123456"],
      ["#000000", "#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
    ]) {
      expect(() =>
        validateRenderRequestV4(
          requestWithDie({
            ...base,
            appearance: { ...base.appearance, palette },
          }),
        ),
      ).toThrow("Render request groups[0][0].appearance.palette is invalid");
    }
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            texture: { ...base.appearance.texture, rotation: 360 },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.texture.rotation must be from 0 through 359",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            lighting: { mode: "none", strength: "gentle" },
          },
        }),
      ),
    ).toThrow("Render request groups[0][0].appearance.lighting is invalid");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            engraving: { ...base.appearance.engraving, fontId: "missing" },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.engraving.fontId is not supported",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          icons: ["trashcan", "explosion", "recycle", "unique"],
        }),
      ),
    ).toThrow("Render request groups[0][0].icons must contain at most three icons");
  });
});
