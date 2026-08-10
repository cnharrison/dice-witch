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
      progress: 0,
      intensity: 0,
    });
    expect(pixelTransitionFrame(PIXEL_TRANSITION_MILLISECONDS * 0.42)).toMatchObject({
      source: "next",
      blockSize: 9,
      progress: 0.42,
    });
    expect(pixelTransitionFrame(PIXEL_TRANSITION_MILLISECONDS / 2)).toMatchObject({
      source: "next",
      progress: 0.5,
      intensity: 1,
    });
    expect(pixelTransitionFrame(PIXEL_TRANSITION_MILLISECONDS)).toMatchObject({
      source: "next",
      blockSize: 1,
      progress: 1,
    });
  });
});
