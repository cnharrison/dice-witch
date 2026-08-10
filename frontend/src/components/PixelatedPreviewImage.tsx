import type {
  AppearancePreviewV3,
  AppearancePreviewV4,
} from "@/types/appearance";
import * as React from "react";
import { useBrowserMediaQueryV4 } from "./dice-v4-3d/browser-media";
import {
  PIXEL_TRANSITION_MILLISECONDS,
  pixelTransitionFrame,
} from "./pixel-transition";

type PreviewImage = AppearancePreviewV3 | AppearancePreviewV4;

type DisplayedPreview = Readonly<{
  preview: PreviewImage;
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

function drawPixelatedFrame(
  canvas: HTMLCanvasElement,
  scratch: HTMLCanvasElement,
  image: HTMLImageElement,
  blockSize: number,
): void {
  const context = canvas.getContext("2d");
  const scratchContext = scratch.getContext("2d");
  if (context === null || scratchContext === null) {
    throw new Error("Preview pixel transition canvas is unavailable");
  }
  const smallWidth = Math.max(1, Math.round(canvas.width / blockSize));
  const smallHeight = Math.max(1, Math.round(canvas.height / blockSize));
  scratch.width = smallWidth;
  scratch.height = smallHeight;
  scratchContext.clearRect(0, 0, smallWidth, smallHeight);
  scratchContext.imageSmoothingEnabled = true;
  drawContainedImage(scratchContext, image, smallWidth, smallHeight);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    scratch,
    0,
    0,
    smallWidth,
    smallHeight,
    0,
    0,
    canvas.width,
    canvas.height,
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
  const reducedMotion = useBrowserMediaQueryV4(
    "(prefers-reduced-motion: reduce)",
  );
  const [displayed, setDisplayed] = React.useState<DisplayedPreview | null>(null);
  const [transition, setTransition] = React.useState<LoadedTransition | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const generationRef = React.useRef(0);

  React.useEffect(() => {
    if (candidate === undefined) return;
    if (displayed === null || reducedMotion) {
      const generation = ++generationRef.current;
      setTransition(null);
      void loadImage(previewSource(candidate))
        .then(() => {
          if (generation !== generationRef.current) return;
          setDisplayed({ preview: candidate, alt });
          onDisplay();
        })
        .catch((error: unknown) => {
          if (generation !== generationRef.current) return;
          onError(
            error instanceof Error
              ? error
              : new Error("Preview image could not be decoded"),
          );
        });
      return;
    }
    if (previewSource(displayed.preview) === previewSource(candidate)) {
      generationRef.current += 1;
      setTransition(null);
      return;
    }
    const generation = ++generationRef.current;
    void Promise.all([
      loadImage(previewSource(displayed.preview)),
      loadImage(previewSource(candidate)),
    ]).then(([current, next]) => {
      if (generation !== generationRef.current) return;
      setTransition({
        current,
        next,
        display: { preview: candidate, alt },
        generation,
      });
    }).catch((error: unknown) => {
      if (generation !== generationRef.current) return;
      setTransition(null);
      onError(
        error instanceof Error
          ? error
          : new Error("Preview image could not be decoded"),
      );
    });
  }, [alt, candidate, displayed, onDisplay, onError, reducedMotion, retryKey]);

  React.useEffect(() => {
    if (transition === null) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const scratch = document.createElement("canvas");
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
      drawPixelatedFrame(
        canvas,
        scratch,
        frame.source === "current" ? transition.current : transition.next,
        frame.blockSize,
      );
      if (elapsed >= PIXEL_TRANSITION_MILLISECONDS) {
        if (transition.generation !== generationRef.current) return;
        setDisplayed(transition.display);
        setTransition(null);
        onDisplay();
        return;
      }
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [onDisplay, transition]);

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
        src={previewSource(displayed.preview)}
        width={displayed.preview.width}
        height={displayed.preview.height}
        alt={displayed.alt}
        className="h-auto max-w-full object-contain"
      />
      {transition !== null && (
        <canvas
          ref={canvasRef}
          width={displayed.preview.width}
          height={displayed.preview.height}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        />
      )}
    </span>
  );
}
