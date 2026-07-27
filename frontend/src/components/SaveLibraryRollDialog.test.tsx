// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createSavedRoll, listSavedRolls } = vi.hoisted(() => ({
  createSavedRoll: vi.fn(),
  listSavedRolls: vi.fn(),
}));

vi.mock("@/lib/saved-rolls", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("@/lib/saved-rolls")>();
  return { ...original, createSavedRoll, listSavedRolls };
});

import { SaveLibraryRollDialog } from "./SaveLibraryRollDialog";

beforeEach(() => {
  createSavedRoll.mockReset();
  listSavedRolls.mockReset();
  listSavedRolls.mockResolvedValue({ listRevision: 7, savedRolls: [] });
  createSavedRoll.mockResolvedValue({
    status: "applied",
    listRevision: 8,
    savedRoll: {
      version: 2,
      id: "00000000-0000-4000-8000-000000000001",
      nameColor: null,
    },
  });
});

afterEach(cleanup);

describe("SaveLibraryRollDialog", () => {
  it("summarizes and saves the exact composition through the V2 contract", async () => {
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <SaveLibraryRollDialog
          open
          onOpenChange={onOpenChange}
          composition={{ notation: "2d20+5", title: "Attack", repetitions: 3 }}
          manageableGuilds={[]}
        />
      </QueryClientProvider>,
    );

    const dialogHeading = screen.getByRole("heading", { name: "Save to Library" });
    expect(dialogHeading.className).toContain("sr-only");
    expect(screen.queryByText(
      "Name this composition and choose its destination and optional text color.",
    )).toBeNull();
    expect(screen.getByText("2d20+5")).toBeDefined();
    expect(screen.getByText("Attack")).toBeDefined();
    expect(screen.getByText("×3")).toBeDefined();
    const colorButton = screen.getByRole("button", {
      name: "Default text color",
    });
    await user.click(colorButton);
    const colorHeading = screen.getByRole("heading", {
      name: "Roll name color",
    });
    expect(colorHeading.parentElement?.className).toContain("sr-only");
    const initialSuggestions = screen.getAllByRole("button", { name: /^Use #/u });
    expect(initialSuggestions).toHaveLength(5);
    const selectedSuggestion = initialSuggestions[0]?.getAttribute("aria-label");
    if (selectedSuggestion === null || selectedSuggestion === undefined) {
      throw new Error("Expected a color suggestion");
    }
    await user.click(initialSuggestions[0]!);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Use #/u })).toHaveLength(5);
      expect(screen.queryByRole("button", { name: selectedSuggestion })).toBeNull();
    });
    expect(screen.getByRole("dialog")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Default" }));

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Sword attack");
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createSavedRoll).toHaveBeenCalledWith(
        { type: "personal" },
        {
          expectedListRevision: 7,
          draft: {
            version: 2,
            name: "Sword attack",
            nameColor: null,
            notation: "2d20+5",
            title: "Attack",
            repetitions: 3,
          },
        },
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
