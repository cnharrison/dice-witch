// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import { AppearanceApiError } from "@/lib/appearance-api-error";
import { getAppearancePreviewV4 } from "@/lib/appearance-v4";
import { createDefaultDiceViewPreferencesV4 } from "@dice-witch/dice-v4-model";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearancePreviewPaneV3 } from "./AppearancePreviewPaneV3";

vi.mock("@/lib/appearance-v4", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appearance-v4")>();
  return { ...actual, getAppearancePreviewV4: vi.fn() };
});

const preview = vi.mocked(getAppearancePreviewV4);
const recipe = APPEARANCE_CATALOG_V3.styles[0]?.recipe;
const diceView = createDefaultDiceViewPreferencesV4();
if (recipe === undefined) throw new Error("Preview recipe fixture is missing");

function renderPreview(target: "all" | "d20" = "all") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <AppearancePreviewPaneV3
        target={target}
        recipe={recipe}
        diceView={diceView}
      />
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
    expect(status.querySelector('[data-loading-glyph="sparkles"]')).not.toBeNull();
  });

  it("renders the V4 PNG and sends every preview input", async () => {
    const user = userEvent.setup();
    preview.mockResolvedValue({
      version: 4,
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
    expect(preview).toHaveBeenCalledWith(
      {
        target: "all",
        recipe,
        diceView,
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
        expect.objectContaining({ state: "critical-success", diceView }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("sends per-die overrides only with the ALL composite", async () => {
    preview.mockResolvedValue({
      version: 4,
      contentType: "image/png",
      width: 750,
      height: 300,
      base64: "iVBORw0KGgo=",
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const overrides = { d20: recipe };
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <AppearancePreviewPaneV3
          target="all"
          recipe={recipe}
          diceView={diceView}
          overrides={overrides}
        />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(preview).toHaveBeenLastCalledWith(
        expect.objectContaining({ target: "all", overrides }),
        expect.any(AbortSignal),
      ),
    );

    rerender(
      <QueryClientProvider client={client}>
        <AppearancePreviewPaneV3
          target="d20"
          recipe={recipe}
          diceView={diceView}
          overrides={overrides}
        />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(preview).toHaveBeenLastCalledWith(
        expect.objectContaining({ target: "d20" }),
        expect.any(AbortSignal),
      ),
    );
    expect(preview.mock.calls.at(-1)?.[0]).not.toHaveProperty("overrides");
  });

  it("contains tall all-dice previews inside the fixed-height panel", async () => {
    preview.mockResolvedValue({
      version: 4,
      contentType: "image/png",
      width: 450,
      height: 630,
      base64: "iVBORw0KGgo=",
    });
    renderPreview();

    const image = await screen.findByRole("img", {
      name: "All dice appearance preview",
    });
    expect(image.classList).toContain("absolute");
    expect(image.classList).toContain("max-h-full");
    expect(image.parentElement?.classList).toContain("h-full");
    expect(image.parentElement?.parentElement?.classList).toContain("h-full");
  });

  it("keeps the previous preview visible while a replacement loads", async () => {
    preview
      .mockResolvedValueOnce({
        version: 4,
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
        <AppearancePreviewPaneV3
          target="d20"
          recipe={recipe}
          diceView={diceView}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("img", { name: "All dice appearance preview" }),
    ).toBeDefined();
  });

  it("requests a new V4 PNG when camera preferences change", async () => {
    preview.mockResolvedValue({
      version: 4,
      contentType: "image/png",
      width: 300,
      height: 150,
      base64: "iVBORw0KGgo=",
    });
    const { rerender, client } = renderPreview("d20");
    expect(
      await screen.findByRole("img", { name: "d20 appearance preview" }),
    ).toBeDefined();

    const adjusted = { ...diceView, elevationDegrees: 47 };
    rerender(
      <QueryClientProvider client={client}>
        <AppearancePreviewPaneV3
          target="d20"
          recipe={recipe}
          diceView={adjusted}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: "d20", diceView: adjusted }),
      expect.any(AbortSignal),
    );
  });

  it("keeps renderer failures visible and retries only on request", async () => {
    const user = userEvent.setup();
    preview
      .mockRejectedValueOnce(
        new AppearanceApiError("appearance_renderer_failed", 502),
      )
      .mockResolvedValueOnce({
        version: 4,
        contentType: "image/png",
        width: 150,
        height: 150,
        base64: "iVBORw0KGgo=",
      });
    renderPreview("d20");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Error. Try again.",
    );
    expect(preview).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(
      await screen.findByRole("img", { name: "d20 appearance preview" }),
    ).toBeDefined();
    expect(preview).toHaveBeenCalledTimes(2);
  });
});
