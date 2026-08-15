import { describe, expect, it } from "vitest";
import {
  APPEARANCE_RANDOMIZATION_POLICIES_V3,
  APPEARANCE_TARGETS_V4,
  CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4,
  CRITICAL_TREATMENTS_V4,
  ENGRAVING_FINISHES_V4,
  FANTASY_ESSENCE_PALETTES_R33_V4,
  FONT_IDS_V4,
  MATERIAL_FAMILIES_V4,
  PATTERN_IDS_V4,
  POLYHEDRAL_FORMS_V4,
  RENDERER_REVISIONS_V4,
  RENDER_FORMS_V4,
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  TEXTURE_GENERATOR_IDS_V4,
  TEXTURE_SCOPES_V4,
  WOOD_FINISHES_V4,
  WOOD_STYLES_V4,
} from "../src";

function expectUniqueBoundedIds(values: readonly string[]): void {
  expect(new Set(values).size).toBe(values.length);
  for (const value of values) {
    expect(value.length).toBeGreaterThan(0);
    expect(value.length).toBeLessThanOrEqual(64);
    expect(value).toMatch(/^[a-z][a-z0-9-]*$/);
  }
}

describe("V4 registries", () => {
  it("pins the locked r33 Fantasy essence palettes", () => {
    expect(FANTASY_ESSENCE_PALETTES_R33_V4).toEqual({
      ice: ["#071b2b", "#2f7f9d", "#a9e8f2", "#f4fdff"],
      void: ["#020106", "#100826", "#3a1764", "#9a62d6"],
      corruption: ["#101607", "#354d12", "#6daf25", "#c7f45b"],
      arcane: ["#16062e", "#55208f", "#b04ee8", "#f0b7ff"],
      "living-eye": ["#1c0805", "#7b2416", "#d89a32", "#f5e6a8"],
      cosmic: ["#050924", "#213b86", "#8c3fc7", "#f2d36b"],
      blood: ["#120203", "#4b070b", "#a61920", "#f06458"],
      bone: ["#3a3022", "#8a7657", "#d2c29d", "#f2ead4"],
    });
  });

  it("pins the supported targets and forms", () => {
    expect(APPEARANCE_TARGETS_V4).toEqual([
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d20",
      "percentile",
      "fudge",
      "other",
    ]);
    expect(RENDER_FORMS_V4).toEqual([
      ...POLYHEDRAL_FORMS_V4,
      "sphere",
    ]);
    expect(Object.isFrozen(APPEARANCE_TARGETS_V4)).toBe(true);
    expect(Object.isFrozen(RENDER_FORMS_V4)).toBe(true);
  });

  it("keeps every public identifier unique and bounded", () => {
    for (const registry of [
      APPEARANCE_RANDOMIZATION_POLICIES_V3,
      APPEARANCE_TARGETS_V4,
      MATERIAL_FAMILIES_V4,
      PATTERN_IDS_V4,
      FONT_IDS_V4,
      ENGRAVING_FINISHES_V4,
      RENDER_FORMS_V4,
      TEXTURE_GENERATOR_IDS_V4,
      TEXTURE_SCOPES_V4,
      CRITICAL_TREATMENTS_V4,
      RENDERER_REVISIONS_V4,
    ]) {
      expectUniqueBoundedIds(registry);
      expect(Object.isFrozen(registry)).toBe(true);
    }
  });

  it("assigns one texture generator and critical treatment to every family", () => {
    expect(Object.keys(TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4)).toEqual(
      MATERIAL_FAMILIES_V4,
    );
    expect(Object.keys(CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4)).toEqual(
      MATERIAL_FAMILIES_V4,
    );
    expect(
      Object.values(TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4).every((value) =>
        TEXTURE_GENERATOR_IDS_V4.includes(value),
      ),
    ).toBe(true);
    expect(
      Object.values(CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4).every((value) =>
        CRITICAL_TREATMENTS_V4.includes(value),
      ),
    ).toBe(true);
    expect(Object.isFrozen(TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4)).toBe(
      true,
    );
    expect(Object.isFrozen(CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4)).toBe(
      true,
    );
  });

  it("includes authored natural and carved wood directions", () => {
    expect(WOOD_STYLES_V4).toContain("beech");
    expect(WOOD_FINISHES_V4).toContain("vine-carved");
    expectUniqueBoundedIds(WOOD_STYLES_V4);
    expectUniqueBoundedIds(WOOD_FINISHES_V4);
    expect(Object.isFrozen(WOOD_STYLES_V4)).toBe(true);
    expect(Object.isFrozen(WOOD_FINISHES_V4)).toBe(true);
  });

  it("pins scope-free r1 and explicit-scope additive renderer revisions", () => {
    expect(TEXTURE_SCOPES_V4).toEqual([
      "die-wide",
      "face-local",
      "bounded-die-wide",
    ]);
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
  });
});
