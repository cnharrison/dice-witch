// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import {
  getAppearancePreviewV3,
  getAppearancePreviewV4,
} from "@/lib/appearance-v3";
import {
  createDefaultDiceViewPreferencesV4,
  type PublicRenderModelV4,
} from "@dice-witch/dice-v4-model";
import baseRenderModel from "./dice-v4-3d/fixtures/d6-r3.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearancePreviewPaneV3 } from "./AppearancePreviewPaneV3";

vi.mock("@/lib/appearance-v3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appearance-v3")>();
  return {
    ...actual,
    getAppearancePreviewV3: vi.fn(),
    getAppearancePreviewV4: vi.fn(),
  };
});

vi.mock("./DiceAnimation3D", () => ({
  DiceAnimation3D: ({
    renderModel,
    animateResult,
    maximumResultRows,
  }: {
    renderModel: PublicRenderModelV4;
    animateResult: boolean;
    maximumResultRows: number;
  }) => (
    <div
      data-testid="camera-preview"
      data-animate-result={String(animateResult)}
      data-maximum-result-rows={maximumResultRows}
      data-elevation={renderModel.groups[0]?.[0]?.view?.kind === "camera"
        ? renderModel.groups[0][0].view.elevationDegrees
        : "authored"}
    />
  ),
}));

const preview = vi.mocked(getAppearancePreviewV3);
const previewV4 = vi.mocked(getAppearancePreviewV4);
const recipe = APPEARANCE_CATALOG_V3.styles[0]?.recipe;
if (recipe === undefined) throw new Error("V3 preview recipe fixture is missing");
const cameraRenderModel = {
  ...baseRenderModel,
  rendererRevision: "canvaskit-v4-r25",
  groups: baseRenderModel.groups.map((group) =>
    group.map((die) => ({
      ...die,
      view: {
        kind: "camera",
        elevationDegrees: 40,
        azimuthOffsetDegrees: 0,
        poseAzimuthDegrees: 0,
      },
    })),
  ),
} as PublicRenderModelV4;

function renderPreview(target: "all" | "d20" = "all") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <AppearancePreviewPaneV3 target={target} recipe={recipe} />
    </QueryClientProvider>,
  );
  return { ...result, client };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppearancePreviewPaneV3", () => {
  it("shows only the minimal sparkle glyph while the preview loads", () => {
    preview.mockImplementation(() => new Promise(() => undefined));
    renderPreview();

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading preview");
    const spinner = status.querySelector('[data-loading-glyph="sparkles"]');
    expect(spinner).not.toBeNull();
    expect(spinner?.querySelector("text")).toBeNull();
    expect(spinner?.querySelectorAll(".dice-witch-sparkle")).toHaveLength(3);
    expect(screen.queryByText(/authoritative|V4|20/i)).toBeNull();
  });

  it("renders the authoritative all-dice PNG and sends every preview input", async () => {
    const user = userEvent.setup();
    preview.mockResolvedValue({
      version: 3,
      contentType: "image/png",
      width: 750,
      height: 300,
      base64: "iVBORw0KGgo=",
    });
    renderPreview();

    const image = await screen.findByRole("img", {
      name: "All dice appearance preview",
    });
    expect(image.getAttribute("width")).toBe("750");
    expect(image.getAttribute("height")).toBe("300");
    expect(preview).toHaveBeenCalledWith({
      target: "all",
      recipe,
      seed: 0x51ce_b00c,
      state: "normal",
    });

    await user.selectOptions(
      screen.getByLabelText("Preview critical state"),
      "critical-success",
    );
    await waitFor(() =>
      expect(preview).toHaveBeenLastCalledWith({
        target: "all",
        recipe,
        seed: 0x51ce_b00c,
        state: "critical-success",
      }),
    );
  });

  it("keeps the previous preview visible while a replacement loads", async () => {
    preview
      .mockResolvedValueOnce({
        version: 3,
        contentType: "image/png",
        width: 750,
        height: 300,
        base64: "iVBORw0KGgo=",
      })
      .mockImplementation(() => new Promise(() => undefined));
    const { rerender, client } = renderPreview();

    expect(
      await screen.findByRole("img", { name: "All dice appearance preview" }),
    ).toBeDefined();
    rerender(
      <QueryClientProvider client={client}>
        <AppearancePreviewPaneV3 target="d20" recipe={recipe} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("img", { name: "All dice appearance preview" }),
    ).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("updates the local camera model without requesting another preview", async () => {
    const diceView = createDefaultDiceViewPreferencesV4();
    previewV4.mockResolvedValue({
      version: 4,
      contentType: "image/png",
      width: 150,
      height: 150,
      base64: "iVBORw0KGgo=",
      renderModel: cameraRenderModel,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <AppearancePreviewPaneV3
          target="d6"
          recipe={recipe}
          diceView={diceView}
          mode="camera"
        />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("camera-preview").dataset.elevation).toBe("40"),
    );
    expect(screen.getByTestId("camera-preview").dataset.maximumResultRows).toBe("2");
    expect(screen.getByTestId("camera-preview").dataset.animateResult).toBe("true");
    expect(document.querySelector('[aria-label="Preview"] [aria-live="polite"]')?.className)
      .toContain("h-72");
    const adjusted = { ...diceView, elevationDegrees: 47 };
    view.rerender(
      <QueryClientProvider client={client}>
        <AppearancePreviewPaneV3
          target="d6"
          recipe={recipe}
          diceView={adjusted}
          mode="camera"
        />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("camera-preview").dataset.elevation).toBe("47"),
    );
    expect(previewV4).toHaveBeenCalledTimes(1);
  });

  it("keeps renderer failures visible and retries only on request", async () => {
    const user = userEvent.setup();
    preview
      .mockRejectedValueOnce(new Error("appearance_renderer_failed"))
      .mockResolvedValueOnce({
        version: 3,
        contentType: "image/png",
        width: 150,
        height: 150,
        base64: "iVBORw0KGgo=",
      });
    renderPreview("d20");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "appearance_renderer_failed",
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(preview).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(
      await screen.findByRole("img", { name: "d20 appearance preview" }),
    ).toBeDefined();
    expect(preview).toHaveBeenCalledTimes(2);
  });
});
