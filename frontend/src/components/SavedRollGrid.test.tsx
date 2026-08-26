// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SavedRollGrid, type SavedRollGridRow } from "./SavedRollGrid";

const savedRoll = {
  version: 2 as const,
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Fireball",
  comparisonKey: "fireball",
  notation: "8d6",
  title: "Damage",
  repetitions: 2,
  nameColor: null,
  pinned: false,
  manualOrder: 0,
  revision: 1,
  createdAt: 1_767_225_600_123,
  updatedAt: 1_767_225_700_123,
};

function row(overrides: Partial<SavedRollGridRow> = {}): SavedRollGridRow {
  return {
    savedRoll,
    listRevision: 1,
    source: { type: "personal" },
    canManage: true,
    ...overrides,
  };
}

function props(rows: SavedRollGridRow[], searchMode = false) {
  return {
    rows,
    searchMode,
    searchSort: { column: "name" as const, direction: "asc" as const },
    canReorder: true,
    pending: false,
    selectedIds: new Set<string>(),
    onSelectionChange: vi.fn(),
    onSearchSortChange: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
  };
}

const originalMatchMedia = window.matchMedia;

function matchOnly(queryToMatch: string): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === queryToMatch,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("SavedRollGrid", () => {
  it("defaults to ascending manual order and enables drag only in that view", async () => {
    const user = userEvent.setup();
    render(
      <SavedRollGrid
        {...props([
          row(),
          row({
            savedRoll: {
              ...savedRoll,
              id: "00000000-0000-4000-8000-000000000002",
              displayName: "Acid Arrow",
              comparisonKey: "acid arrow",
              manualOrder: 1,
            },
          }),
        ])}
      />,
    );

    const names = screen.getAllByRole("row").slice(1).map((tableRow) => tableRow.textContent);
    expect(names[0]).toContain("Fireball");
    expect(names[1]).toContain("Acid Arrow");
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect((screen.getByRole("button", { name: "Move Fireball" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("columnheader", { name: /Order/ })).toBeNull();
    expect(screen.getByRole("button", { name: "About library order" })).toBeDefined();
    const table = screen.getByRole("table");
    expect(table.parentElement?.className).toContain("overflow-y-hidden");
    expect(table.className).toContain("table-fixed");
    expect(screen.queryByLabelText(/Pin/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Created/ }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect((screen.getByRole("button", { name: "Move Fireball" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Use library order" }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect((screen.getByRole("button", { name: "Move Fireball" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("uses cards through the narrow tablet breakpoint", () => {
    matchOnly("(max-width: 767px)");

    render(<SavedRollGrid {...props([row()])} />);

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("list")).toBeDefined();
    expect(screen.getByText("Edited")).toBeDefined();
  });

  it("hides library-specific order in global search and truncates Server source visually", () => {
    const guildName = "A Server Name That Is Intentionally Extremely Long";
    render(
      <SavedRollGrid
        {...props([
          row({
            source: {
              type: "guild",
              guildId: "100000000000000001",
              guildName,
              guildIcon: null,
            },
            canManage: false,
          }),
        ], true)}
      />,
    );

    expect(screen.queryByRole("columnheader", { name: /Order/ })).toBeNull();
    expect(screen.getByText(guildName).getAttribute("title")).toBe(guildName);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Fireball" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select Fireball" })).toBeDefined();
  });

  it("allows the selected roll to be deselected", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <SavedRollGrid
        {...props([row()])}
        selectedIds={new Set([savedRoll.id])}
        onSelectionChange={onSelectionChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select Fireball" }));
    expect([...onSelectionChange.mock.calls[0][0]]).toEqual([]);
  });

  it("supports additive checkbox selection and select all without modifier keys", async () => {
    const rows = ["Fireball", "Acid Arrow", "Magic Missile"].map(
      (displayName, index) => row({
        savedRoll: {
          ...savedRoll,
          id: `00000000-0000-4000-8000-00000000000${String(index + 1)}`,
          displayName,
          comparisonKey: displayName.toLocaleLowerCase(),
          manualOrder: index,
        },
      }),
    );
    function Harness() {
      const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(
        () => new Set(),
      );
      return (
        <SavedRollGrid
          {...props(rows)}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      );
    }
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("checkbox", { name: "Select Fireball" }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const selectAll = screen.getByRole("checkbox", {
      name: "Select all visible rolls",
    }) as HTMLInputElement;
    expect(selectAll.indeterminate).toBe(true);

    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("checkbox", { name: "Select Magic Missile" }));
    await user.keyboard("{/Shift}");
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect(
      (screen.getByRole("checkbox", { name: "Select Acid Arrow" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "Select Acid Arrow" }));

    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect(screen.getAllByRole("checkbox").slice(1).every(
      (checkbox) => (checkbox as HTMLInputElement).checked,
    )).toBe(true);
    expect(selectAll.checked).toBe(true);

    await user.click(selectAll);
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect(screen.getAllByRole("checkbox").every(
      (checkbox) => !(checkbox as HTMLInputElement).checked,
    )).toBe(true);
  });
});
