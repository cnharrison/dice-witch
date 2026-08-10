export const PIXEL_TRANSITION_MILLISECONDS = 220;
const MAX_PIXEL_BLOCK_SIZE = 9;
const SOURCE_SWITCH_PROGRESS = 0.42;

export type PixelTransitionFrame = Readonly<{
  source: "current" | "next";
  blockSize: number;
  progress: number;
  intensity: number;
}>;

function cubicEase(value: number): number {
  return value < 0.5
    ? 4 * value ** 3
    : 1 - (-2 * value + 2) ** 3 / 2;
}

export function pixelTransitionFrame(elapsed: number): PixelTransitionFrame {
  const progress = Math.max(
    0,
    Math.min(1, elapsed / PIXEL_TRANSITION_MILLISECONDS),
  );
  const showingCurrent = progress < SOURCE_SWITCH_PROGRESS;
  const phaseProgress = showingCurrent
    ? progress / SOURCE_SWITCH_PROGRESS
    : (1 - progress) / (1 - SOURCE_SWITCH_PROGRESS);
  return {
    source: showingCurrent ? "current" : "next",
    blockSize:
      1 +
      Math.round(cubicEase(phaseProgress) * (MAX_PIXEL_BLOCK_SIZE - 1)),
    progress,
    intensity: Math.sin(Math.PI * progress),
  };
}
