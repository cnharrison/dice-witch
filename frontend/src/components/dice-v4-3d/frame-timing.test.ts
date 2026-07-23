import { describe, expect, it } from "vitest";
import { summarizeThreeFrameTimingsV4 } from "./frame-timing";

describe("V4 Three.js frame timing summary", () => {
  it("reports deterministic sorted percentiles and averages", () => {
    expect(summarizeThreeFrameTimingsV4([10, 2, 8, 4, 6])).toEqual({
      samples: 5,
      minimumMilliseconds: 2,
      p50Milliseconds: 6,
      p95Milliseconds: 9.6,
      maximumMilliseconds: 10,
      meanMilliseconds: 6,
    });
  });

  it("interpolates percentiles without mutating the input", () => {
    const samples = [4, 1, 3, 2];

    expect(summarizeThreeFrameTimingsV4(samples)).toEqual({
      samples: 4,
      minimumMilliseconds: 1,
      p50Milliseconds: 2.5,
      p95Milliseconds: 3.8499999999999996,
      maximumMilliseconds: 4,
      meanMilliseconds: 2.5,
    });
    expect(samples).toEqual([4, 1, 3, 2]);
  });

  it("rejects empty or invalid timing samples", () => {
    expect(() => summarizeThreeFrameTimingsV4([])).toThrow(
      "Three.js V4 frame timings must be a non-empty finite sample",
    );
    expect(() => summarizeThreeFrameTimingsV4([1, -1])).toThrow(
      "Three.js V4 frame timings must be a non-empty finite sample",
    );
    expect(() => summarizeThreeFrameTimingsV4([Number.NaN])).toThrow(
      "Three.js V4 frame timings must be a non-empty finite sample",
    );
  });
});
