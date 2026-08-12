import type { AppearancePreviewV4 } from "@/types/appearance";
import * as React from "react";
import { useBrowserMediaQueryV4 } from "./dice-v4-3d/browser-media";
import {
  PIXEL_TRANSITION_MILLISECONDS,
  pixelTransitionFrame,
} from "./pixel-transition";

type PreviewImage = AppearancePreviewV4;

export type PixelatedImageCandidate = Readonly<{
  source: string;
  width: number;
  height: number;
}>;

type DisplayedPreview = Readonly<{
  image: PixelatedImageCandidate;
  alt: string;
}>;

type LoadedTransition = Readonly<{
  current: HTMLImageElement;
  next: HTMLImageElement;
  display: DisplayedPreview;
  generation: number;
}>;

function previewSource(preview: PreviewImage): string {
  return `data:${preview.contentType};base64,${preview.base64}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = source;
  return typeof image.decode === "function"
    ? image.decode().then(() => image)
    : Promise.resolve(image);
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawArcaneInterferenceFrame(
  canvas: HTMLCanvasElement,
  scratch: HTMLCanvasElement,
  frameCanvas: HTMLCanvasElement,
  image: HTMLImageElement,
  frame: ReturnType<typeof pixelTransitionFrame>,
  generation: number,
): void {
  const context = canvas.getContext("2d");
  const scratchContext = scratch.getContext("2d");
  const frameContext = frameCanvas.getContext("2d");
  if (context === null || scratchContext === null || frameContext === null) {
    throw new Error("Preview pixel transition canvas is unavailable");
  }
  const smallWidth = Math.max(1, Math.round(canvas.width / frame.blockSize));
  const smallHeight = Math.max(1, Math.round(canvas.height / frame.blockSize));
  scratch.width = smallWidth;
  scratch.height = smallHeight;
  scratchContext.clearRect(0, 0, smallWidth, smallHeight);
  scratchContext.imageSmoothingEnabled = true;
  drawContainedImage(scratchContext, image, smallWidth, smallHeight);

  frameCanvas.width = canvas.width;
  frameCanvas.height = canvas.height;
  frameContext.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
  frameContext.imageSmoothingEnabled = false;
  frameContext.drawImage(
    scratch,
    0,
    0,
    smallWidth,
    smallHeight,
    0,
    0,
    frameCanvas.width,
    frameCanvas.height,
  );

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = frame.intensity * 0.13;
  context.filter = "sepia(1) saturate(9) hue-rotate(126deg)";
  context.drawImage(frameCanvas, -6 * frame.intensity, 0);
  context.filter = "sepia(1) saturate(9) hue-rotate(258deg)";
  context.drawImage(frameCanvas, 6 * frame.intensity, 0);
  context.restore();

  const stripCount = 12;
  const stripHeight = height / stripCount;
  for (let index = 0; index < stripCount; index += 1) {
    const omen = Math.sin(index * 8.17 + generation * 2.3);
    const shift = omen * frame.intensity * 18;
    context.drawImage(
      frameCanvas,
      0,
      index * stripHeight,
      width,
      stripHeight,
      shift,
      index * stripHeight,
      width,
      stripHeight,
    );
  }

  context.save();
  context.globalCompositeOperation = "source-atop";
  const sweep = context.createLinearGradient(
    width * (frame.progress - 0.22),
    0,
    width * (frame.progress + 0.18),
    height,
  );
  sweep.addColorStop(0, "rgba(35,241,255,0)");
  sweep.addColorStop(0.45, `rgba(35,241,255,${frame.intensity * 0.24})`);
  sweep.addColorStop(0.55, `rgba(255,38,225,${frame.intensity * 0.3})`);
  sweep.addColorStop(1, "rgba(255,38,225,0)");
  context.fillStyle = sweep;
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 24; index += 1) {
    const phase = (index % 7) / 7;
    const angle = index * 2.4 + generation;
    const radius = 0.12 + ((index * 37) % 100) / 100 * 0.36;
    const x = width * (0.5 + Math.cos(angle) * radius);
    const y = height * (0.5 + Math.sin(angle) * radius);
    const twinkle = Math.max(
      0,
      Math.sin((frame.progress * 2.6 + phase) * Math.PI * 2),
    ) * frame.intensity;
    if (twinkle < 0.18) continue;
    const size = (1 + index % 3) * (1 + twinkle);
    context.save();
    context.translate(x + Math.sin(phase * 20) * frame.intensity * 9, y);
    context.fillStyle = index % 2 === 0 ? "#ff3de8" : "#38f5ff";
    context.globalAlpha = twinkle * 0.9;
    context.beginPath();
    context.moveTo(0, -size * 2.8);
    context.lineTo(size, 0);
    context.lineTo(0, size * 2.8);
    context.lineTo(-size, 0);
    context.closePath();
    context.fill();
    context.fillRect(-size * 2.2, -0.5, size * 4.4, 1);
    context.restore();
  }
  context.restore();
}

export function PixelatedImageTransition({
  candidate,
  alt,
  onDisplay,
  onError,
  retryKey = 0,
}: {
  candidate?: PixelatedImageCandidate;
  alt: string;
  onDisplay(): void;
  onError(error: Error): void;
  retryKey?: number;
}) {
  const reducedMotion = useBrowserMediaQueryV4(
    "(prefers-reduced-motion: reduce)",
  );
  const [displayed, setDisplayed] = React.useState<DisplayedPreview | null>(null);
  const [transition, setTransition] = React.useState<LoadedTransition | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const generationRef = React.useRef(0);
  const requestKeyRef = React.useRef<string | null>(null);
  const onDisplayRef = React.useRef(onDisplay);
  const onErrorRef = React.useRef(onError);
  onDisplayRef.current = onDisplay;
  onErrorRef.current = onError;

  React.useEffect(() => {
    if (candidate === undefined) return;
    const source = candidate.source;
    const requestKey = `${String(retryKey)}:${reducedMotion ? "reduce" : "animate"}:${alt}:${source}`;
    if (requestKeyRef.current === requestKey) return;
    requestKeyRef.current = requestKey;
    if (displayed === null || reducedMotion) {
      const generation = ++generationRef.current;
      setTransition(null);
      void loadImage(source)
        .then(() => {
          if (generation !== generationRef.current) return;
          setDisplayed({ image: candidate, alt });
          onDisplayRef.current();
        })
        .catch((error: unknown) => {
          if (generation !== generationRef.current) return;
          onErrorRef.current(
            error instanceof Error
              ? error
              : new Error("Preview image could not be decoded"),
          );
        });
      return;
    }
    if (displayed.image.source === source) {
      generationRef.current += 1;
      setTransition(null);
      return;
    }
    const generation = ++generationRef.current;
    void Promise.all([
      loadImage(displayed.image.source),
      loadImage(source),
    ]).then(([current, next]) => {
      if (generation !== generationRef.current) return;
      setTransition({
        current,
        next,
        display: { image: candidate, alt },
        generation,
      });
    }).catch((error: unknown) => {
      if (generation !== generationRef.current) return;
      setTransition(null);
      onErrorRef.current(
        error instanceof Error
          ? error
          : new Error("Preview image could not be decoded"),
      );
    });
  }, [alt, candidate, displayed, reducedMotion, retryKey]);

  React.useEffect(() => {
    if (transition === null) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const scratch = document.createElement("canvas");
    const frameCanvas = document.createElement("canvas");
    let animationFrame = 0;
    let startedAt: number | null = null;
    const animate = (timestamp: number) => {
      if (transition.generation !== generationRef.current) {
        setTransition((current) =>
          current?.generation === transition.generation ? null : current,
        );
        return;
      }
      startedAt ??= timestamp;
      const elapsed = timestamp - startedAt;
      const frame = pixelTransitionFrame(elapsed);
      drawArcaneInterferenceFrame(
        canvas,
        scratch,
        frameCanvas,
        frame.source === "current" ? transition.current : transition.next,
        frame,
        transition.generation,
      );
      if (elapsed >= PIXEL_TRANSITION_MILLISECONDS) {
        if (transition.generation !== generationRef.current) return;
        setDisplayed(transition.display);
        setTransition(null);
        onDisplayRef.current();
        return;
      }
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [transition]);

  React.useEffect(
    () => () => {
      generationRef.current += 1;
    },
    [],
  );

  if (displayed === null) return null;
  return (
    <span className="relative grid max-w-full place-items-center">
      <img
        src={displayed.image.source}
        width={displayed.image.width}
        height={displayed.image.height}
        alt={displayed.alt}
        className="h-auto max-w-full object-contain"
      />
      {transition !== null && (
        <canvas
          ref={canvasRef}
          width={displayed.image.width}
          height={displayed.image.height}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        />
      )}
    </span>
  );
}

export function PixelatedPreviewImage({
  candidate,
  alt,
  onDisplay,
  onError,
  retryKey = 0,
}: {
  candidate?: PreviewImage;
  alt: string;
  onDisplay(): void;
  onError(error: Error): void;
  retryKey?: number;
}) {
  return (
    <PixelatedImageTransition
      candidate={
        candidate === undefined
          ? undefined
          : {
              source: previewSource(candidate),
              width: candidate.width,
              height: candidate.height,
            }
      }
      alt={alt}
      onDisplay={onDisplay}
      onError={onError}
      retryKey={retryKey}
    />
  );
}
