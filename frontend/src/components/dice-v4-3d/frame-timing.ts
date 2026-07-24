export type ThreeFrameTimingSummaryV4 = {
  samples: number;
  minimumMilliseconds: number;
  p50Milliseconds: number;
  p95Milliseconds: number;
  maximumMilliseconds: number;
  meanMilliseconds: number;
};

function percentileV4(sorted: readonly number[], percentile: number): number {
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) {
    throw new Error(
      "Three.js V4 frame timings must be a non-empty finite sample",
    );
  }
  return lower + (upper - lower) * (position - lowerIndex);
}

export function summarizeThreeFrameTimingsV4(
  samples: readonly number[],
): ThreeFrameTimingSummaryV4 {
  if (
    samples.length === 0 ||
    samples.some((sample) => !Number.isFinite(sample) || sample < 0)
  ) {
    throw new Error(
      "Three.js V4 frame timings must be a non-empty finite sample",
    );
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    samples: sorted.length,
    minimumMilliseconds: sorted[0]!,
    p50Milliseconds: percentileV4(sorted, 0.5),
    p95Milliseconds: percentileV4(sorted, 0.95),
    maximumMilliseconds: sorted.at(-1)!,
    meanMilliseconds:
      sorted.reduce((total, sample) => total + sample, 0) / sorted.length,
  };
}
