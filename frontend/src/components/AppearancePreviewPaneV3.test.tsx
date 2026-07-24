// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import { getAppearancePreviewV3 } from "@/lib/appearance-v3";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearancePreviewPaneV3 } from "./AppearancePreviewPaneV3";

vi.mock("@/lib/appearance-v3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appearance-v3")>();
  return { ...actual, getAppearancePreviewV3: vi.fn() };
});

const preview = vi.mocked(getAppearancePreviewV3);
const recipe = APPEARANCE_CATALOG_V3.styles[0]?.recipe;
if (recipe === undefined) throw new Error("V3 preview recipe fixture is missing");

function renderPreview(target: "all" | "d20" = "all"): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AppearancePreviewPaneV3 target={target} recipe={recipe} />
    </QueryClientProvider>,
  );
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
