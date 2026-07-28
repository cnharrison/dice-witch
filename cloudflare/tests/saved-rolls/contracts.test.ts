import { describe, expect, it } from "vitest";
import {
  SAVED_ROLL_UNICODE_VERSION,
  parseSavedRollDraftV1,
  parseSavedRollDraftV2,
  parseSavedRollNameV1,
  parseSavedRollNameColorV2,
} from "../../packages/saved-rolls/src";

describe("saved-roll V1 names", () => {
  it("pins the shared Unicode rules", () => {
    expect(SAVED_ROLL_UNICODE_VERSION).toBe("16.0.0");
  });

  it("normalizes display spacing and canonical composition", () => {
    expect(parseSavedRollNameV1("  Cafe\u0301   Fire  ")).toEqual({
      displayName: "Café Fire",
      comparisonKey: "café fire",
    });
  });

  it.each([
    ["Fireball", "fireball"],
    ["FIREBALL", "fireball"],
    ["Straße", "strasse"],
    ["Ｓｐｅｌｌ", "spell"],
    ["ℌex", "hex"],
  ])("creates an NFKC case-fold key for %s", (name, expected) => {
    expect(parseSavedRollNameV1(name).comparisonKey).toBe(expected);
  });

  it("counts Unicode grapheme clusters rather than UTF-16 units", () => {
    const valid = "🧙".repeat(80);
    expect(parseSavedRollNameV1(valid).displayName).toBe(valid);
    expect(() => parseSavedRollNameV1(`${valid}🧙`)).toThrow(
      "Saved roll name must contain 1 through 80 characters",
    );
  });

  it.each([
    ["", "empty"],
    ["   ", "spaces only"],
    ["line\nbreak", "control"],
    ["hidden\u200Bname", "zero-width"],
    ["override\u202Ename", "bidirectional override"],
    ["non\u00A0breaking", "non-ordinary whitespace"],
    ["future\u{1FAEA}", "code point outside Unicode 16"],
  ])("rejects %s (%s)", (name) => {
    expect(() => parseSavedRollNameV1(name)).toThrow(/Saved roll name/);
  });
});

describe("Library roll V2 colors", () => {
  const draft = {
    version: 2,
    name: "Fireball",
    nameColor: "#A1B2C3",
    notation: "8d6",
    title: null,
    repetitions: 1,
  } as const;

  it("parses an explicit uppercase base color and Default state", () => {
    expect(parseSavedRollDraftV2(draft).nameColor).toBe("#A1B2C3");
    expect(parseSavedRollDraftV2({ ...draft, nameColor: null }).nameColor).toBeNull();
  });

  it.each(["#a1b2c3", "#A1B2C", "A1B2C3", "#GGGGGG"])(
    "rejects noncanonical color %s",
    (nameColor) => {
      expect(() => parseSavedRollNameColorV2(nameColor)).toThrow(
        "Library roll name color must be null or uppercase #RRGGBB",
      );
    },
  );

  it("keeps V1 exact by rejecting the V2 color field", () => {
    expect(() => parseSavedRollDraftV1({ ...draft, version: 1 })).toThrow(
      "Saved roll draft has invalid fields",
    );
  });
});

describe("saved-roll V1 drafts", () => {
  const draft = {
    version: 1,
    name: "Fireball",
    notation: "8d6",
    title: "Fire damage",
    repetitions: 1,
  } as const;

  it("parses a complete bounded roll template", () => {
    expect(parseSavedRollDraftV1(draft)).toEqual({
      version: 1,
      displayName: "Fireball",
      comparisonKey: "fireball",
      notation: "8d6",
      title: "Fire damage",
      repetitions: 1,
    });
  });

  it("accepts an omitted title as null", () => {
    expect(parseSavedRollDraftV1({ ...draft, title: null }).title).toBeNull();
  });

  it.each([
    [{ ...draft, extra: true }, "unexpected field"],
    [{ ...draft, version: 2 }, "unsupported version"],
    [{ ...draft, notation: "not dice" }, "notation without dice"],
    [{ ...draft, notation: "1d1000" }, "die over product limit"],
    [{ ...draft, repetitions: 0 }, "zero repetitions"],
    [{ ...draft, repetitions: 51 }, "too many repetitions"],
    [{ ...draft, title: "" }, "empty title"],
    [{ ...draft, title: "x".repeat(257) }, "oversized title"],
  ])("rejects an invalid draft: %s", (value, reason) => {
    expect(() => parseSavedRollDraftV1(value), reason).toThrow(/Saved roll/);
  });
});
