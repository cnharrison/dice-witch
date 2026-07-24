// @vitest-environment jsdom

import { parsePublicRenderModelV4 } from "@dice-witch/dice-v4-model";
import fixture from "./dice-v4-3d/fixtures/d6-r3.json";
import { ThemeProvider } from "./theme-provider";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererMocks = vi.hoisted(() => ({
  replaceModel: vi.fn(async () => {}),
  setRolling: vi.fn(),
  dispose: vi.fn(),
  create: vi.fn(),
  runtimeUnavailable: null as ((error: Error) => void) | null,
}));

vi.mock("./dice-v4-3d/roll-renderer", () => ({
  createThreeRollRendererV4: rendererMocks.create,
}));

import { DiceAnimation3D } from "./DiceAnimation3D";

function stubMatchMedia(reducedMotion = false): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches:
        query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderAnimation(
  props: Partial<React.ComponentProps<typeof DiceAnimation3D>> = {},
): ReturnType<typeof render> {
  return render(
    <ThemeProvider defaultTheme="dark" storageKey="dice-animation-test-theme">
      <DiceAnimation3D
        isRolling={false}
        onUnavailable={vi.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  stubMatchMedia();
  rendererMocks.runtimeUnavailable = null;
  rendererMocks.replaceModel.mockReset().mockResolvedValue(undefined);
  rendererMocks.create.mockReset().mockImplementation((_container, callbacks) => {
    rendererMocks.runtimeUnavailable = callbacks.onUnavailable;
    return {
      replaceModel: rendererMocks.replaceModel,
      setRolling: rendererMocks.setRolling,
      dispose: rendererMocks.dispose,
    };
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("DiceAnimation3D", () => {
  it("uses the exact prepared model with blank faces, then reveals authoritative results", async () => {
    const onReadyChange = vi.fn();
    const authoritative = parsePublicRenderModelV4(fixture);
    const view = renderAnimation({
      renderModel: authoritative,
      blankFaces: true,
      onReadyChange,
    });

    await waitFor(() =>
      expect(rendererMocks.replaceModel).toHaveBeenCalledWith(authoritative, {
        animateResult: false,
        blankFaces: true,
        reducedMotion: false,
      }),
    );

    view.rerender(
      <ThemeProvider defaultTheme="dark" storageKey="dice-animation-test-theme">
        <DiceAnimation3D
          renderModel={authoritative}
          isRolling={false}
          blankFaces={false}
          onReadyChange={onReadyChange}
          onUnavailable={vi.fn()}
        />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(rendererMocks.replaceModel).toHaveBeenLastCalledWith(
        authoritative,
        { animateResult: true, blankFaces: false, reducedMotion: false },
      ),
    );
    expect(onReadyChange).toHaveBeenLastCalledWith(true);
  });

  it("keeps the ready scene visible while later models replace in place", async () => {
    const model = parsePublicRenderModelV4(fixture);
    const onReadyChange = vi.fn();
    const view = renderAnimation({
      renderModel: model,
      blankFaces: true,
      appearanceIdentities: [["die-1"]],
      onReadyChange,
    });
    await waitFor(() => expect(onReadyChange).toHaveBeenLastCalledWith(true));
    onReadyChange.mockClear();

    let finishReplacement: (() => void) | undefined;
    rendererMocks.replaceModel.mockReturnValueOnce(
      new Promise((resolve) => {
        finishReplacement = resolve;
      }),
    );
    view.rerender(
      <ThemeProvider defaultTheme="dark" storageKey="dice-animation-test-theme">
        <DiceAnimation3D
          renderModel={model}
          isRolling={false}
          blankFaces
          appearanceIdentities={[["die-1"]]}
          onReadyChange={onReadyChange}
          onUnavailable={vi.fn()}
        />
      </ThemeProvider>,
    );

    await waitFor(() => expect(rendererMocks.replaceModel).toHaveBeenCalledTimes(2));
    expect(
      view.container.querySelector("[data-three-dice-status]")?.getAttribute(
        "data-three-dice-status",
      ),
    ).toBe("ready");
    expect(onReadyChange).not.toHaveBeenCalledWith(false);

    await act(async () => {
      finishReplacement?.();
      await Promise.resolve();
    });
    expect(onReadyChange).not.toHaveBeenCalled();
  });

  it("honors reduced motion and disposes the renderer on unmount", async () => {
    stubMatchMedia(true);
    const view = renderAnimation({
      renderModel: parsePublicRenderModelV4(fixture),
      isRolling: true,
    });

    await waitFor(() =>
      expect(rendererMocks.replaceModel).toHaveBeenCalledWith(
        expect.any(Object),
        { animateResult: true, blankFaces: false, reducedMotion: true },
      ),
    );
    expect(rendererMocks.setRolling).toHaveBeenCalledWith(true, true);

    view.unmount();
    expect(rendererMocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not report ready after a runtime failure resolves stale preparation", async () => {
    let finishReplacement: (() => void) | undefined;
    rendererMocks.replaceModel.mockReturnValueOnce(
      new Promise((resolve) => {
        finishReplacement = resolve;
      }),
    );
    const onReadyChange = vi.fn();
    const onUnavailable = vi.fn();
    renderAnimation({
      renderModel: parsePublicRenderModelV4(fixture),
      onReadyChange,
      onUnavailable,
    });
    await waitFor(() => expect(rendererMocks.replaceModel).toHaveBeenCalled());

    await act(async () => {
      rendererMocks.runtimeUnavailable?.(new Error("WebGL context was lost"));
      finishReplacement?.();
      await Promise.resolve();
    });

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(onReadyChange).not.toHaveBeenCalledWith(true);
    expect(onReadyChange).toHaveBeenLastCalledWith(false);
  });

  it("reports renderer initialization failures without retaining a controller", async () => {
    const onUnavailable = vi.fn();
    const failure = new Error("WebGL unavailable");
    rendererMocks.create.mockImplementationOnce(() => {
      throw failure;
    });

    renderAnimation({
      renderModel: parsePublicRenderModelV4(fixture),
      onUnavailable,
    });

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledWith(failure));
    expect(rendererMocks.replaceModel).not.toHaveBeenCalled();
  });
});
