import { describe, expect, it } from "vitest";
import {
  PIXEL_TRANSITION_MILLISECONDS,
  pixelTransitionFrame,
} from "./pixel-transition";

describe("pixelTransitionFrame", () => {
  it("pixelates the old preview and resolves the new preview in 220ms", () => {
    expect(pixelTransitionFrame(0)).toEqual({
      source: "current",
      blockSize: 1,
    });
    expect(pixelTransitionFrame(PIXEL_TRANSITION_MILLISECONDS / 2)).toEqual({
      source: "next",
      blockSize: 10,
    });
    expect(pixelTransitionFrame(PIXEL_TRANSITION_MILLISECONDS)).toEqual({
      source: "next",
      blockSize: 1,
    });
  });
});
