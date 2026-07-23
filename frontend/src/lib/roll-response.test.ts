import { describe, expect, it } from "vitest";
import d6Fixture from "@/components/dice-v4-3d/fixtures/d6-r3.json";
import {
  parseWebRollPreparation,
  parseWebRollResponse,
} from "./roll-response";

const v4Response = {
  message: "Message sent to Discord channel",
  diceArray: [
    [
      {
        sides: 6,
        rolled: 6,
        value: 6,
        icon: [],
        color: "#ff00ff",
        secondaryColor: "#111111",
        textColor: "#111111",
      },
    ],
  ],
  resultArray: [{ output: "1d6: [6] = 6", results: 6 }],
  appearanceIdentities: [["expression:0:repeat:0:definition:6:0:die:0"]],
  rerolledAppearanceIdentities: [],
  renderedImage: {
    contentType: "image/png",
    width: 150,
    height: 150,
    base64: "iVBORw0KGgo=",
  },
  renderModel: d6Fixture,
};

function summaryDie(
  sides: number | "%" | "F",
  rolled: number,
  icon: string[] = [],
) {
  return {
    sides,
    rolled,
    value: rolled,
    icon,
    color: "#ff00ff",
    secondaryColor: "#111111",
    textColor: "#111111",
  };
}

describe("web roll response boundary", () => {
  it("parses an exact blank-face preparation and rejects model drift", () => {
    const preparation = {
      renderSeed: 0x51ce_b00c,
      appearanceDigest: "a".repeat(64),
      groupSizes: [1],
      appearanceIdentities: v4Response.appearanceIdentities,
      renderedImage: v4Response.renderedImage,
      renderModel: d6Fixture,
    };

    expect(parseWebRollPreparation(preparation)).toEqual(preparation);
    expect(() =>
      parseWebRollPreparation({
        ...preparation,
        groupSizes: [2],
        appearanceIdentities: [["first", "second"]],
      }),
    ).toThrow("Web roll preparation does not match render model");
  });

  it("parses an authoritative V4 model that matches the legacy summary", () => {
    const parsed = parseWebRollResponse(v4Response);

    expect(parsed.renderModel).toEqual(d6Fixture);
    expect(parsed.diceArray[0]?.[0]).toMatchObject({
      sides: 6,
      rolled: 6,
      color: "#ff00ff",
    });
  });

  it("parses percentile, Fudge, other, and nonempty V4 icons", () => {
    const base = d6Fixture.groups[0][0];
    const renderModel = {
      version: 4,
      rendererRevision: "canvaskit-v4-r3",
      groups: [
        [
          { ...base, target: "percentile", result: 90, icons: ["recycle"] },
          { ...base, target: "d10", result: 7 },
          { ...base, target: "fudge", result: -1 },
          { ...base, target: "other", sides: 100, result: 73, form: "sphere" },
        ],
      ],
    };
    const parsed = parseWebRollResponse({
      ...v4Response,
      diceArray: [[
        summaryDie("%", 90, ["recycle"]),
        summaryDie(10, 7),
        summaryDie("F", -1),
        summaryDie(100, 73),
      ]],
      appearanceIdentities: [["percentile", "ones", "fudge", "other"]],
      rerolledAppearanceIdentities: ["percentile"],
      renderModel,
    });

    expect(parsed.diceArray[0]?.map(({ sides }) => sides)).toEqual([
      "%",
      10,
      "F",
      100,
    ]);
    expect(parsed.diceArray[0]?.[0]?.icon).toEqual(["recycle"]);
  });

  it("preserves a valid production-compatible V3 response without a model", () => {
    const parsed = parseWebRollResponse({
      message: "Message sent to Discord channel",
      diceArray: [
        [
          {
            sides: 20,
            rolled: 17,
            value: 17,
            icon: [],
            color: "#123456",
            secondaryColor: "#654321",
            textColor: "#ffffff",
          },
        ],
      ],
      resultArray: [{ output: "1d20: [17] = 17", results: 17 }],
      appearanceIdentities: [["expression:0:repeat:0:definition:20:0:die:0"]],
      rerolledAppearanceIdentities: [],
      renderedImage: {
        contentType: "image/png",
        width: 150,
        height: 150,
        base64: "iVBORw0KGgo=",
      },
    });

    expect(parsed.renderModel).toBeUndefined();
    expect(parsed.diceArray[0]?.[0]?.rolled).toBe(17);
  });

  it("preserves the exact invalid-notation and permission-error envelopes", () => {
    expect(
      parseWebRollResponse({
        error: "🚫🎲 Invalid dice notation!",
        message: "🚫🎲 Invalid dice notation!",
        diceArray: [],
        resultArray: [],
        appearanceIdentities: [],
        rerolledAppearanceIdentities: [],
      }),
    ).toEqual({
      error: "🚫🎲 Invalid dice notation!",
      message: "🚫🎲 Invalid dice notation!",
      diceArray: [],
      resultArray: [],
      appearanceIdentities: [],
      rerolledAppearanceIdentities: [],
    });
    const permission = parseWebRollResponse({
      ...v4Response,
      error: "PERMISSION_ERROR",
      message:
        "Dice Witch needs permission to read message history, attach files, and embed links to show you the dice. 😊",
    });
    expect(permission).toMatchObject({
      error: "PERMISSION_ERROR",
      message:
        "Dice Witch needs permission to read message history, attach files, and embed links to show you the dice. 😊",
      renderModel: d6Fixture,
      renderedImage: v4Response.renderedImage,
    });
  });

  it("accepts the maximum 50 one-die icon rows", () => {
    const diceArray = Array.from({ length: 50 }, () => [summaryDie(6, 6)]);
    const resultArray = Array.from({ length: 50 }, (_, index) => ({
      output: `1d6 repetition ${index + 1}`,
      results: 6,
    }));
    const appearanceIdentities = Array.from({ length: 50 }, (_, index) => [
      `expression:0:repeat:${String(index)}:definition:6:0:die:0`,
    ]);

    const parsed = parseWebRollResponse({
      message: "Message sent to Discord channel",
      diceArray,
      resultArray,
      appearanceIdentities,
      rerolledAppearanceIdentities: [],
      renderedImage: {
        contentType: "image/png",
        width: 150,
        height: 9_350,
        base64: "iVBORw0KGgo=",
      },
    });

    expect(parsed.diceArray).toHaveLength(50);
    expect(parsed.renderedImage?.height).toBe(9_350);
  });

  it("rejects malformed, mismatched, and extra-key envelopes", () => {
    expect(() =>
      parseWebRollResponse({ ...v4Response, unexpected: true }),
    ).toThrow("Web roll response is invalid");
    expect(() =>
      parseWebRollResponse({
        ...v4Response,
        renderModel: { ...d6Fixture, unexpected: true },
      }),
    ).toThrow("Web roll response is invalid");
    expect(() =>
      parseWebRollResponse({
        ...v4Response,
        rerolledAppearanceIdentities: ["unknown"],
      }),
    ).toThrow("Web roll response is invalid");
    expect(() =>
      parseWebRollResponse({
        ...v4Response,
        diceArray: [[{ ...v4Response.diceArray[0][0], rolled: 5 }]],
      }),
    ).toThrow("Web roll response does not match render model");
    expect(() =>
      parseWebRollResponse({
        error: "temporary",
        message: "different",
        diceArray: [],
        resultArray: [],
        appearanceIdentities: [],
        rerolledAppearanceIdentities: [],
      }),
    ).toThrow("Web roll response is invalid");
    expect(() =>
      parseWebRollResponse({
        ...v4Response,
        diceArray: [[
          {
            ...v4Response.diceArray[0][0],
            icon: undefined,
          },
        ]],
      }),
    ).toThrow("Web roll response is invalid");
    expect(() =>
      parseWebRollResponse({
        ...v4Response,
        renderModel: undefined,
        diceArray: [Array.from({ length: 51 }, () => summaryDie(6, 6))],
      }),
    ).toThrow("Web roll response is invalid");
    expect(() =>
      parseWebRollResponse({
        ...v4Response,
        renderModel: undefined,
        diceArray: [[
          {
            ...v4Response.diceArray[0][0],
            iconSpacing: 37,
          },
        ]],
      }),
    ).toThrow("Web roll response is invalid");
    expect(() =>
      parseWebRollResponse({
        ...v4Response,
        renderModel: undefined,
        resultArray: [],
      }),
    ).toThrow("Web roll response result groups do not match dice");
  });
});
