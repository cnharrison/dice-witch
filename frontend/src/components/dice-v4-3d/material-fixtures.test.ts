import { createHash } from "node:crypto";
import { parsePublicRenderModelV4 } from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import combinedRaw from "./fixtures/d20-lighting-combined-gentle-upper-left-r3.json?raw";
import directionalRaw from "./fixtures/d20-lighting-directional-subtle-right-r3.json?raw";
import facetRaw from "./fixtures/d20-lighting-facet-strong-r3.json?raw";
import crystalCutRaw from "./fixtures/d20-glass-crystal-cut-r3.json?raw";
import classicRaw from "./fixtures/d20-material-classic-r3.json?raw";
import fantasyRaw from "./fixtures/d20-material-fantasy-r3.json?raw";
import gemstoneRaw from "./fixtures/d20-material-gemstone-r3.json?raw";
import glassRaw from "./fixtures/d20-material-glass-r3.json?raw";
import hollowMetalRaw from "./fixtures/d20-material-hollow-metal-r3.json?raw";
import liquidCoreRaw from "./fixtures/d20-material-liquid-core-r3.json?raw";
import metalRaw from "./fixtures/d20-material-metal-r3.json?raw";
import sharpResinRaw from "./fixtures/d20-material-sharp-resin-r3.json?raw";
import stoneRaw from "./fixtures/d20-material-stone-r3.json?raw";
import sharpRaw from "./fixtures/d20-sharp-resin-sharp-r3.json?raw";
import woodRaw from "./fixtures/d20-material-wood-r3.json?raw";

const MATERIAL_CASES = [
  ["classic", classicRaw, "e4b9859becbbb3df4f182330967793dc6ad13d7584500b628ea7da619a12c937"],
  ["sharp-resin", sharpResinRaw, "3c5ec0b7200ad6ec548f2af73de7b1611278308a84a33d36f20482142c24051a"],
  ["liquid-core", liquidCoreRaw, "6edd424c00835bb0f67061570e30f81d4bd9dbcd05721866e692b68765a1ce4c"],
  ["gemstone", gemstoneRaw, "9326e13dab4b582083e2d4721159115f5651bfa1f1df33b3b423c3e06c54adea"],
  ["glass", glassRaw, "450fe20e806382e2aff3e9d292034b7cf537486964e66be0367ddf599c218af6"],
  ["stone", stoneRaw, "2902e69ffb09d8a1c5871c4c898b0d3abe62dfdcf6f8c909ee1cc638b8f546cc"],
  ["metal", metalRaw, "3a3e9674cb5a53c2b4cb7c3ee56257b6a3edf46dfa6cc93c4d5ceeee7cd6f444"],
  ["hollow-metal", hollowMetalRaw, "5e5eaf0d465d45f34c89fa18bef589183c06a247cd36e5f97de0f2fb6d8510dc"],
  ["wood", woodRaw, "bacee5df5856306e757e74c67e52d4eedf5454cad95ab0eca0562dd9213bf1d9"],
  ["fantasy", fantasyRaw, "4dafac77beda354fa46f39a27b1dc81fdfb8620464142cd74327d54f16f3a6b2"],
] as const;

const SPECIAL_FORM_CASES = [
  [
    sharpRaw,
    "sharp",
    "sharp-resin",
    "45ccea8f66aaabb9d76f882244f2025b26729cade18b3c2418061b873f593b00",
  ],
  [
    crystalCutRaw,
    "crystal-cut",
    "glass",
    "994c2bc08eb9626143d34a7c17e986587e14ee570c8c0f259fefcf1b0ac68abf",
  ],
  [
    hollowMetalRaw,
    "hollow-cage",
    "hollow-metal",
    "5e5eaf0d465d45f34c89fa18bef589183c06a247cd36e5f97de0f2fb6d8510dc",
  ],
] as const;

const LIGHTING_CASES = [
  [
    combinedRaw,
    { mode: "combined", strength: "gentle", direction: "upper-left" },
    "aadadd2939a59b23dfbc53485dee0f9b69dd3b3dfff02fcf27a045eeca1829cc",
  ],
  [
    directionalRaw,
    { mode: "directional", strength: "subtle", direction: "right" },
    "6b0555d2c5ac2c7368bdd7382cd5898ce652906bd818dc8bda2e9a5dc52a7546",
  ],
  [
    facetRaw,
    { mode: "facet", strength: "strong" },
    "96915027d96d9bae3c88b90817d7167dbbe30b1fdeac261b188fa17f871203c6",
  ],
] as const;

function fixtureHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("V4 Three.js material and lighting fixtures", () => {
  it("pins and parses every material family", () => {
    for (const [family, raw, hash] of MATERIAL_CASES) {
      expect(fixtureHash(raw)).toBe(hash);
      const die = parsePublicRenderModelV4(JSON.parse(raw)).groups[0]?.[0];
      expect(die).toMatchObject({
        target: "d20",
        result: 20,
        form: family === "hollow-metal" ? "hollow-cage" : "standard",
        appearance: {
          material: { family },
          lighting: {
            mode: "combined",
            strength: "gentle",
            direction: "upper-left",
          },
        },
      });
    }
  });

  it("pins and parses every implemented d20 special form", () => {
    for (const [raw, form, family, hash] of SPECIAL_FORM_CASES) {
      expect(fixtureHash(raw)).toBe(hash);
      expect(parsePublicRenderModelV4(JSON.parse(raw)).groups[0]?.[0]).toMatchObject({
        target: "d20",
        result: 20,
        form,
        appearance: { material: { family } },
      });
    }
  });

  it("pins and parses representative lighting modes", () => {
    for (const [raw, lighting, hash] of LIGHTING_CASES) {
      expect(fixtureHash(raw)).toBe(hash);
      const die = parsePublicRenderModelV4(JSON.parse(raw)).groups[0]?.[0];
      expect(die).toMatchObject({
        target: "d20",
        result: 20,
        appearance: { material: { family: "classic" }, lighting },
      });
    }
  });
});
