// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listSavedRolls = vi.fn();

import { SavedRollQuickAccessView } from "./SavedRollQuickAccess";

const savedRoll = {
  version: 2 as const,
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Fireball",
  comparisonKey: "fireball",
  notation: "8d6",
  title: "Damage",
  repetitions: 2,
  nameColor: null,
  pinned: true,
  manualOrder: 0,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};

function renderQuickAccess(
  onLoad = vi.fn(),
  guildScope: { type: "guild"; guildId: string; guildName: string } | null = null,
  recentRolls: readonly import("@/lib/recent-rolls").RecentRoll[] = [],
  stagingReady = true,
  onRollNow = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SavedRollQuickAccessView
          dependencies={{ listSavedRolls }}
          guildScope={guildScope}
          recentRolls={recentRolls}
          stagingReady={stagingReady}
          destinationReady
          onLoad={onLoad}
          onRollNow={onRollNow}
          onClearRecent={vi.fn()}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return onLoad;
}

beforeEach(() => {
  listSavedRolls.mockReset();
  listSavedRolls.mockResolvedValue({ listRevision: 1, savedRolls: [savedRoll] });
});

afterEach(cleanup);

describe("SavedRollQuickAccess", () => {
  it("loads a selected entry as a detached roller draft", async () => {
    const user = userEvent.setup();
    const onLoad = renderQuickAccess();
    await user.click(await screen.findByRole("button", { name: "Load Fireball" }));
    expect(onLoad).toHaveBeenCalledWith({
      notation: "8d6",
      title: "Damage",
      repetitions: 2,
    });
    expect(screen.queryByRole("tablist", { name: "Library" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage" })).toBeNull();
    expect(screen.getByText("Repeat ×2")).toBeDefined();
  });

  it("preserves Library identity when rolling a saved entry now", async () => {
    const user = userEvent.setup();
    const onRollNow = vi.fn();
    renderQuickAccess(vi.fn(), null, [], true, onRollNow);

    const rollNow = await screen.findByRole("button", { name: "Roll Fireball now" });
    await user.hover(rollNow);
    expect(
      await screen.findAllByText(
        "Send this saved roll immediately to your selected Discord channel.",
      ),
    ).not.toHaveLength(0);
    await user.click(rollNow);

    expect(onRollNow).toHaveBeenCalledWith({
      notation: "8d6",
      title: "Damage",
      repetitions: 2,
      libraryRoll: {
        scope: "personal",
        id: savedRoll.id,
        revision: savedRoll.revision,
      },
      libraryDisplayName: "Fireball",
      libraryNameColor: null,
    });
  });

  it("loads the selected Server library directly from its tab", async () => {
    const serverRoll = {
      ...savedRoll,
      id: "00000000-0000-4000-8000-000000000002",
      displayName: "Server fireball",
    };
    listSavedRolls.mockImplementation((scope: { type: string }) =>
      Promise.resolve({
        listRevision: 1,
        savedRolls: scope.type === "guild" ? [serverRoll] : [savedRoll],
      }),
    );
    const user = userEvent.setup();
    const onLoad = renderQuickAccess(vi.fn(), {
      type: "guild",
      guildId: "100000000000000001",
      guildName: "Fixture guild",
    });

    await user.click(await screen.findByRole("tab", { name: "Server" }));
    await user.click(await screen.findByRole("button", { name: "Load Server fireball" }));

    expect(onLoad).toHaveBeenCalledWith({
      notation: "8d6",
      title: "Damage",
      repetitions: 2,
    });
    expect(screen.getByRole("tab", { name: "Server" }).getAttribute("aria-selected")).toBe("true");
  });

  it("hides the Library switcher when the selected server has no rolls", async () => {
    listSavedRolls.mockImplementation((scope: { type: string }) =>
      Promise.resolve({
        listRevision: 1,
        savedRolls: scope.type === "guild" ? [] : [savedRoll],
      }),
    );
    const guildScope = {
      type: "guild" as const,
      guildId: "100000000000000001",
      guildName: "Fixture guild",
    };

    renderQuickAccess(vi.fn(), guildScope);

    expect(await screen.findByRole("button", { name: "Load Fireball" })).toBeDefined();
    await waitFor(() => expect(listSavedRolls).toHaveBeenCalledWith(guildScope));
    expect(screen.queryByRole("tablist", { name: "Library" })).toBeNull();
    expect(screen.getByRole("region", { name: "Library" })).toBeDefined();
  });

  it("disables staging while no server is selected", async () => {
    const user = userEvent.setup();
    const onLoad = renderQuickAccess(vi.fn(), null, [], false);
    const load = await screen.findByRole("button", { name: "Load Fireball" });

    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect((load as HTMLButtonElement).disabled).toBe(true);
    await user.click(load);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("updates the active Server tab when the selected server changes", async () => {
    listSavedRolls.mockImplementation(
      (scope: { type: string; guildId?: string }) =>
        Promise.resolve({
          listRevision: 1,
          savedRolls:
            scope.type === "guild"
              ? [
                  {
                    ...savedRoll,
                    id:
                      scope.guildId === "100000000000000001"
                        ? "00000000-0000-4000-8000-000000000002"
                        : "00000000-0000-4000-8000-000000000003",
                    displayName:
                      scope.guildId === "100000000000000001"
                        ? "First server roll"
                        : "Second server roll",
                  },
                ]
              : [savedRoll],
        }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SavedRollQuickAccessView
            dependencies={{ listSavedRolls }}
            guildScope={{
              type: "guild",
              guildId: "100000000000000001",
              guildName: "First server",
            }}
            recentRolls={[]}
            stagingReady
            destinationReady
            onLoad={vi.fn()}
            onRollNow={vi.fn()}
            onClearRecent={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "Server" }));
    expect(
      await screen.findByRole("button", { name: "Load First server roll" }),
    ).toBeDefined();

    view.rerender(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SavedRollQuickAccessView
            dependencies={{ listSavedRolls }}
            guildScope={{
              type: "guild",
              guildId: "100000000000000002",
              guildName: "Second server",
            }}
            recentRolls={[]}
            stagingReady
            destinationReady
            onLoad={vi.fn()}
            onRollNow={vi.fn()}
            onClearRecent={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("button", { name: "Load Second server roll" }),
    ).toBeDefined();
    expect(
      screen.getByRole("tab", { name: "Server" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.queryByRole("button", { name: "Load First server roll" }),
    ).toBeNull();
  });

  it("shows distinct recent compositions before the Library", async () => {
    renderQuickAccess(vi.fn(), null, [{
      notation: "1d20+5",
      title: "Initiative",
      repetitions: 1,
    }]);

    expect(await screen.findByRole("heading", { name: "Recent" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Load Initiative" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Roll Initiative now" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Clear recent rolls" })).toBeDefined();
    const library = screen.getByRole("region", { name: "Library" });
    expect(library.className).toContain("bg-background");
    expect(library.className).not.toContain("bg-card");
    expect(screen.queryByRole("button", { name: "Save current" })).toBeNull();
  });

  it("labels and restores a recent saved roll with its Library identity", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderQuickAccess(onLoad, null, [{
      notation: "1d20+5",
      title: "Attack",
      repetitions: 1,
      libraryRoll: {
        scope: "personal",
        id: savedRoll.id,
        revision: 2,
        displayName: "Longsword",
        nameColor: "#B0005A",
      },
    }]);

    expect(await screen.findByText("Personal")).toBeDefined();
    const name = screen.getByText("Longsword");
    expect(name.className).toContain("--library-roll-name-light");
    expect(name.style.getPropertyValue("--library-roll-name-light")).not.toBe("");
    await user.click(screen.getByRole("button", { name: "Load Longsword" }));
    expect(onLoad).toHaveBeenCalledWith({
      notation: "1d20+5",
      title: "Attack",
      repetitions: 1,
      libraryRoll: {
        scope: "personal",
        id: savedRoll.id,
        revision: 2,
      },
      libraryDisplayName: "Longsword",
      libraryNameColor: "#B0005A",
    });
  });
});
