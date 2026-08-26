// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PixelatedPreviewImage } from "./PixelatedPreviewImage";

type Decode = (source: string) => Promise<void>;
let decodeImage: Decode;
let animationFrames: Map<number, FrameRequestCallback>;
let nextAnimationFrame: number;

class FakeImage {
  src = "";
  naturalWidth = 150;
  naturalHeight = 150;
  decode(): Promise<void> {
    return decodeImage(this.src);
  }
}

function preview(base64: string) {
  return {
    version: 4 as const,
    contentType: "image/png" as const,
    width: 150,
    height: 150,
    base64,
  };
}

async function runNextFrame(timestamp: number): Promise<void> {
  const next = [...animationFrames.entries()][0];
  if (next === undefined) throw new Error("Animation frame is missing");
  animationFrames.delete(next[0]);
  await act(async () => next[1](timestamp));
}

beforeEach(() => {
  decodeImage = async () => undefined;
  animationFrames = new Map();
  nextAnimationFrame = 0;
  vi.stubGlobal("Image", FakeImage);
  // SAFETY: PixelatedPreviewImage only uses the canvas methods represented by this faithful test double.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
    filter: "none",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
  } as CanvasRenderingContext2D);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextAnimationFrame;
    animationFrames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    animationFrames.delete(id);
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PixelatedPreviewImage", () => {
  it("contains tall previews within both parent dimensions", async () => {
    const props = {
      alt: "All dice appearance preview",
      onDisplay: vi.fn(),
      onError: vi.fn(),
      fitContainer: true,
    };
    const view = render(
      <div style={{ width: 450, height: 264 }}>
        <PixelatedPreviewImage
          candidate={{ ...preview("AAAA"), width: 450, height: 630 }}
          {...props}
        />
      </div>,
    );

    const image = await screen.findByRole("img");
    expect(image.classList).toContain("absolute");
    expect(image.classList).toContain("max-h-full");
    expect(image.parentElement?.classList).toContain("h-full");
    expect(image.parentElement?.classList).toContain("w-full");

    view.rerender(
      <div style={{ width: 450, height: 264 }}>
        <PixelatedPreviewImage
          candidate={{ ...preview("BBBB"), width: 450, height: 630 }}
          {...props}
        />
      </div>,
    );
    await waitFor(() => expect(document.querySelector("canvas")).not.toBeNull());
    expect(document.querySelector("canvas")?.classList).toContain("max-h-full");
  });

  it("reports an undecodable initial preview without hiding the loading state", async () => {
    const failure = new Error("decode failed");
    decodeImage = async () => Promise.reject(failure);
    const onError = vi.fn();
    const onDisplay = vi.fn();
    const candidate = preview("AAAA");
    const view = render(
      <PixelatedPreviewImage
        candidate={candidate}
        alt="Appearance preview"
        onDisplay={onDisplay}
        onError={onError}
      />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    expect(screen.queryByRole("img")).toBeNull();

    decodeImage = async () => undefined;
    view.rerender(
      <PixelatedPreviewImage
        candidate={candidate}
        alt="Appearance preview"
        onDisplay={onDisplay}
        onError={onError}
        retryKey={1}
      />,
    );
    await screen.findByRole("img");
    expect(onDisplay).toHaveBeenCalledTimes(1);
  });

  it("switches immediately without a canvas when reduced motion is enabled", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const props = {
      alt: "Appearance preview",
      onDisplay: vi.fn(),
      onError: vi.fn(),
    };
    const view = render(
      <PixelatedPreviewImage candidate={preview("AAAA")} {...props} />,
    );
    await screen.findByRole("img");

    view.rerender(
      <PixelatedPreviewImage candidate={preview("BBBB")} {...props} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toContain("BBBB"),
    );
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("does not restart a transition for an equivalent preview or new callbacks", async () => {
    const current = preview("AAAA");
    const next = preview("BBBB");
    const view = render(
      <PixelatedPreviewImage
        candidate={current}
        alt="Appearance preview"
        onDisplay={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await screen.findByRole("img");

    view.rerender(
      <PixelatedPreviewImage
        candidate={next}
        alt="Appearance preview"
        onDisplay={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await waitFor(() => expect(animationFrames.size).toBeGreaterThan(0));
    await runNextFrame(0);

    view.rerender(
      <PixelatedPreviewImage
        candidate={preview("BBBB")}
        alt="Appearance preview"
        onDisplay={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await runNextFrame(220);
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toContain("BBBB"),
    );
    expect(animationFrames.size).toBe(0);
  });

  it("keeps the displayed image when a running transition is reverted", async () => {
    const props = {
      alt: "Appearance preview",
      onDisplay: vi.fn(),
      onError: vi.fn(),
    };
    const view = render(
      <PixelatedPreviewImage candidate={preview("AAAA")} {...props} />,
    );
    await screen.findByRole("img");
    view.rerender(
      <PixelatedPreviewImage candidate={preview("BBBB")} {...props} />,
    );
    await waitFor(() => expect(animationFrames.size).toBeGreaterThan(0));
    await runNextFrame(0);

    view.rerender(
      <PixelatedPreviewImage candidate={preview("AAAA")} {...props} />,
    );
    await waitFor(() => expect(document.querySelector("canvas")).toBeNull());
    expect(screen.getByRole("img").getAttribute("src")).toContain("AAAA");
    expect(animationFrames.size).toBe(0);
  });

  it("never commits a superseded transition while the newest image decodes", async () => {
    const props = {
      alt: "Appearance preview",
      onDisplay: vi.fn(),
      onError: vi.fn(),
    };
    const view = render(
      <PixelatedPreviewImage candidate={preview("AAAA")} {...props} />,
    );
    await screen.findByRole("img");

    view.rerender(
      <PixelatedPreviewImage candidate={preview("BBBB")} {...props} />,
    );
    await waitFor(() => expect(animationFrames.size).toBeGreaterThan(0));
    await runNextFrame(0);

    let resolveNewest: (() => void) | undefined;
    const newestDecoded = new Promise<void>((resolve) => {
      resolveNewest = resolve;
    });
    decodeImage = async (source) =>
      source.endsWith("CCCC") ? newestDecoded : undefined;
    view.rerender(
      <PixelatedPreviewImage candidate={preview("CCCC")} {...props} />,
    );
    await act(async () => Promise.resolve());
    await runNextFrame(220);
    expect(screen.getByRole("img").getAttribute("src")).toContain("AAAA");

    await act(async () => resolveNewest?.());
    await waitFor(() => expect(animationFrames.size).toBeGreaterThan(0));
    await runNextFrame(0);
    await runNextFrame(220);
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("src")).toContain("CCCC"),
    );
    expect(props.onError).not.toHaveBeenCalled();
  });
});
