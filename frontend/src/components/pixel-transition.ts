export const PIXEL_TRANSITION_MILLISECONDS = 220;
const MAX_PIXEL_BLOCK_SIZE = 10;

export type PixelTransitionFrame = Readonly<{
  source: "current" | "next";
  blockSize: number;
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
  const firstHalf = progress < 0.5;
  const phaseProgress = firstHalf ? progress * 2 : (1 - progress) * 2;
  return {
    source: firstHalf ? "current" : "next",
    blockSize:
      1 +
      Math.round(cubicEase(phaseProgress) * (MAX_PIXEL_BLOCK_SIZE - 1)),
  };
}
