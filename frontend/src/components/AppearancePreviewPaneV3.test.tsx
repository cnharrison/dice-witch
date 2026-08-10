// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import { AppearanceApiError } from "@/lib/appearance";
import {
  getAppearancePreviewV3,
  getAppearancePreviewV4,
} from "@/lib/appearance-v3";
import { createDefaultDiceViewPreferencesV4 } from "@dice-witch/dice-v4-model";
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

const preview = vi.mocked(getAppearancePreviewV3);
const previewV4 = vi.mocked(getAppearancePreviewV4);
const recipe = APPEARANCE_CATALOG_V3.styles[0]?.recipe;
if (recipe === undefined) throw new Error("V3 preview recipe fixture is missing");
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
    expect(preview).toHaveBeenCalledWith(
      {
        target: "all",
        recipe,
        seed: 0x51ce_b00c,
        state: "normal",
      },
      expect.any(AbortSignal),
    );

    await user.selectOptions(
      screen.getByLabelText("Preview critical state"),
      "critical-success",
    );
    await waitFor(() =>
      expect(preview).toHaveBeenLastCalledWith(
        {
          target: "all",
          recipe,
          seed: 0x51ce_b00c,
          state: "critical-success",
        },
        expect.any(AbortSignal),
      ),
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

  it("aborts an obsolete preview request when its target changes", async () => {
    preview.mockImplementation(() => new Promise(() => undefined));
    const { rerender, client } = renderPreview();
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    const obsoleteSignal = preview.mock.calls[0]?.[1];

    rerender(
      <QueryClientProvider client={client}>
        <AppearancePreviewPaneV3 target="d20" recipe={recipe} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(obsoleteSignal?.aborted).toBe(true);
  });

  it("requests an authoritative PNG when camera preferences change", async () => {
    const diceView = createDefaultDiceViewPreferencesV4();
    previewV4.mockResolvedValue({
      version: 4,
      contentType: "image/png",
      width: 300,
      height: 150,
      base64: "iVBORw0KGgo=",
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
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("img", { name: "d6 appearance preview" }),
    ).toBeDefined();
    expect(document.querySelector('[aria-label="Preview"] [aria-live="polite"]')?.className)
      .toContain("h-72");

    const adjusted = { ...diceView, elevationDegrees: 47 };
    view.rerender(
      <QueryClientProvider client={client}>
        <AppearancePreviewPaneV3
          target="d6"
          recipe={recipe}
          diceView={adjusted}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(previewV4).toHaveBeenCalledTimes(2));
    expect(previewV4).toHaveBeenLastCalledWith(
      {
        target: "d6",
        recipe,
        seed: 0x51ce_b00c,
        state: "normal",
        diceView: adjusted,
      },
      expect.any(AbortSignal),
    );
  });

  it("uses brief retry copy for network failures", async () => {
    preview.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderPreview("d20");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Error. Try again.",
    );
  });

  it("keeps renderer failures visible and retries only on request", async () => {
    const user = userEvent.setup();
    preview
      .mockRejectedValueOnce(
        new AppearanceApiError(
          "appearance_renderer_failed",
          502,
          "appearance_renderer_failed",
        ),
      )
      .mockResolvedValueOnce({
        version: 3,
        contentType: "image/png",
        width: 150,
        height: 150,
        base64: "iVBORw0KGgo=",
      });
    renderPreview("d20");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Error. Try again.",
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
