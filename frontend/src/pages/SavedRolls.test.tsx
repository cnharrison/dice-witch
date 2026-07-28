// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const {
  copySavedRoll,
  createSavedRoll,
  customFetch,
  deleteSavedRollBatch,
  listSavedRollLibraries,
  listSavedRolls,
  searchSavedRolls,
  updateSavedRoll,
} = vi.hoisted(() => ({
  copySavedRoll: vi.fn(),
  createSavedRoll: vi.fn(),
  customFetch: vi.fn(),
  deleteSavedRollBatch: vi.fn(),
  listSavedRollLibraries: vi.fn(),
  listSavedRolls: vi.fn(),
  searchSavedRolls: vi.fn(),
  updateSavedRoll: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ customFetch }));
vi.mock("@/lib/AuthProvider", () => ({
  useUser: () => ({ user: { id: "100000000000000003" } }),
}));
vi.mock("@/lib/saved-rolls", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("@/lib/saved-rolls")>();
  return {
    ...original,
    copySavedRoll,
    createSavedRoll,
    deleteSavedRollBatch,
    listSavedRollLibraries,
    listSavedRolls,
    searchSavedRolls,
    updateSavedRoll,
  };
});

import SavedRolls from "./SavedRolls";

beforeEach(() => {
  copySavedRoll.mockReset();
  createSavedRoll.mockReset();
  customFetch.mockReset();
  deleteSavedRollBatch.mockReset();
  listSavedRollLibraries.mockReset();
  listSavedRolls.mockReset();
  searchSavedRolls.mockReset();
  updateSavedRoll.mockReset();
  copySavedRoll.mockResolvedValue({ status: "applied", listRevision: 1, recordRevision: 1 });
  createSavedRoll.mockResolvedValue({ status: "applied", listRevision: 1, recordRevision: 1 });
  deleteSavedRollBatch.mockResolvedValue({ status: "applied", listRevision: 2 });
  customFetch.mockResolvedValue(Response.json({ guilds: [] }));
  listSavedRollLibraries.mockResolvedValue([]);
  listSavedRolls.mockResolvedValue({ listRevision: 0, savedRolls: [] });
  searchSavedRolls.mockResolvedValue({ entries: [], hasMore: false, total: 0 });
});

afterEach(cleanup);

it("keeps personal management available without an administrable guild", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <SavedRolls />
    </QueryClientProvider>,
  );

  const heading = await screen.findByRole("heading", { name: "Library" });
  expect(heading.className).toContain("font-['UnifrakturMaguntia']");
  expect(heading.className).toContain("text-brand");
  expect(document.querySelector("aside")?.className).toContain("self-start");
  expect(
    screen.queryByRole("combobox", { name: "Library" }),
  ).toBeNull();
  expect(screen.queryByText("Scope")).toBeNull();
  expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  const libraryRegion = screen.getByRole("region", { name: "Library" });
  expect(libraryRegion).toBeDefined();
  expect(libraryRegion.parentElement?.className).toContain(
    "xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]",
  );
  expect(libraryRegion.parentElement?.className).not.toContain(
    "lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]",
  );
  expect(screen.queryByText(/No Library rolls yet/)).toBeNull();
  expect(screen.queryByText(/You don't have any mutual servers/)).toBeNull();

  const create = screen.getByRole("button", { name: "Create" });
  await user.hover(create);
  expect((await screen.findByRole("tooltip")).textContent).toContain(
    "Save a roll for quick access in Discord and the web roller.",
  );
  await user.click(create);
  expect(screen.getByRole("heading", { name: "New Library roll" })).toBeTruthy();
  const dialog = screen.getByRole("dialog");
  const dragHandle = screen.getByTestId("library-dialog-drag-handle");
  Object.defineProperty(dialog, "getBoundingClientRect", {
    value: () => ({
      left: 200,
      right: 700,
      top: 120,
      bottom: 620,
      width: 500,
      height: 500,
      x: 200,
      y: 120,
      toJSON: () => ({}),
    }),
  });
  const centeredTransform = dialog.style.transform;
  fireEvent.pointerDown(dragHandle, { clientX: 300, clientY: 160, pointerId: 1 });
  fireEvent.pointerMove(dragHandle, { clientX: 360, clientY: 210, pointerId: 1 });
  fireEvent.pointerUp(dragHandle, { pointerId: 1 });
  expect(dialog.style.transform).not.toBe(centeredTransform);
  await user.type(screen.getByLabelText("Name"), "Initiative");
  await user.click(
    screen.getByRole("button", { name: "Use Library name as roll title" }),
  );
  expect((screen.getByLabelText("Roll title (optional)") as HTMLInputElement).value).toBe(
    "Initiative",
  );
  await user.type(screen.getByLabelText("Dice notation"), "1d20+3");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(createSavedRoll).toHaveBeenCalledOnce());
  expect(screen.queryByText("Saved roll library updated.")).toBeNull();
});

it("selects all visible rolls and confirms one atomic bulk delete", async () => {
  const rolls = ["Fireball", "Initiative"].map((displayName, index) => ({
    version: 2 as const,
    id: `00000000-0000-4000-8000-00000000000${String(index + 1)}`,
    displayName,
    comparisonKey: displayName.toLocaleLowerCase(),
    notation: index === 0 ? "8d6" : "1d20",
    title: null,
    repetitions: 1,
    nameColor: null,
    pinned: false,
    manualOrder: index,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  }));
  listSavedRolls.mockResolvedValue({ listRevision: 1, savedRolls: rolls });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <SavedRolls />
    </QueryClientProvider>,
  );

  await user.click(await screen.findByRole("checkbox", {
    name: "Select all visible rolls",
  }));
  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(confirm).toHaveBeenCalledWith("Delete 2 rolls?");
  await waitFor(() => expect(deleteSavedRollBatch).toHaveBeenCalledWith(
    { type: "personal" },
    rolls,
    1,
  ));
});

it("suggests Library Name (Server Name) after a copy-name conflict", async () => {
  const savedRoll = {
    version: 2 as const,
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Fireball",
    comparisonKey: "fireball",
    notation: "8d6",
    title: "Fireball damage",
    repetitions: 1,
    nameColor: null,
    pinned: false,
    manualOrder: 0,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  customFetch.mockResolvedValue(
    Response.json({
      guilds: [
        {
          guilds: {
            id: "100000000000000001",
            name: "Friday Game",
            icon: null,
          },
          isAdmin: true,
          isDiceWitchAdmin: false,
        },
      ],
    }),
  );
  listSavedRollLibraries.mockResolvedValue([
    {
      guildId: "100000000000000001",
      guildName: "Friday Game",
      guildIcon: null,
      isAdmin: true,
      isDiceWitchAdmin: false,
    },
  ]);
  listSavedRolls.mockResolvedValue({ listRevision: 1, savedRolls: [savedRoll] });
  copySavedRoll.mockResolvedValue({ status: "name_conflict", listRevision: 1 });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <SavedRolls />
    </QueryClientProvider>,
  );

  const librarySelect = await screen.findByRole("combobox", {
    name: "Library",
  });
  await user.hover(librarySelect);
  expect(
    await screen.findAllByText(
      "Switch between your Personal Library and a Server Library.",
    ),
  ).not.toHaveLength(0);
  await user.unhover(librarySelect);

  await user.click(
    await screen.findByRole("checkbox", { name: "Select Fireball" }),
  );
  const copyButton = screen.getByRole("button", { name: "Copy to…" });
  await user.hover(copyButton);
  expect(
    await screen.findAllByText(
      "Copy the selected roll between your Personal and Server Libraries.",
    ),
  ).not.toHaveLength(0);
  await user.click(copyButton);
  await user.click(screen.getByRole("button", { name: "Copy" }));

  expect(
    (await screen.findByLabelText("New name") as HTMLInputElement).value,
  ).toBe("Fireball (Friday Game)");
});

it("offers only managed Server Libraries in the Library tab", async () => {
  listSavedRollLibraries.mockResolvedValue([{
    guildId: "100000000000000001",
    guildName: "Member Server",
    guildIcon: null,
    isAdmin: false,
    isDiceWitchAdmin: false,
  }]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SavedRolls />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Personal Library")).toBeDefined();
  expect(screen.queryByRole("combobox", { name: "Library" })).toBeNull();

  cleanup();
  listSavedRollLibraries.mockResolvedValue([{
    guildId: "100000000000000002",
    guildName: "Empty Admin Server",
    guildIcon: null,
    isAdmin: true,
    isDiceWitchAdmin: false,
  }]);
  const adminQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={adminQueryClient}>
      <SavedRolls />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("combobox", { name: "Library" })).toBeDefined();
});

it("uses the sparkle state without visible loading copy", () => {
  listSavedRolls.mockReturnValue(new Promise(() => {}));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <SavedRolls />
    </QueryClientProvider>,
  );

  expect(screen.getByRole("status").querySelector('[data-loading-glyph="sparkles"]')).toBeTruthy();
  expect(screen.queryByText("Loading Library…")).toBeNull();
  expect(screen.queryByText("Loading library…")).toBeNull();
});

it("retries an edit against refreshed optimistic revisions without losing the draft", async () => {
  const original = {
    version: 2 as const,
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Fireball",
    comparisonKey: "fireball",
    notation: "8d6",
    title: null,
    repetitions: 1,
    nameColor: null,
    pinned: false,
    manualOrder: 0,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  const refreshed = { ...original, revision: 2, updatedAt: 2 };
  listSavedRolls
    .mockResolvedValueOnce({ listRevision: 1, savedRolls: [original] })
    .mockResolvedValue({ listRevision: 2, savedRolls: [refreshed] });
  updateSavedRoll
    .mockResolvedValueOnce({ status: "record_revision_conflict", recordRevision: 2 })
    .mockResolvedValueOnce({ status: "applied", listRevision: 3, recordRevision: 3 });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <SavedRolls />
    </QueryClientProvider>,
  );

  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const notation = screen.getByLabelText("Dice notation");
  await user.clear(notation);
  await user.type(notation, "10d6");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(/changed in another session/)).toBeTruthy();
  await waitFor(() => expect(listSavedRolls).toHaveBeenCalledTimes(2));

  expect((screen.getByLabelText("Dice notation") as HTMLInputElement).value).toBe("10d6");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(updateSavedRoll).toHaveBeenCalledTimes(2));
  expect(updateSavedRoll.mock.calls[1]?.[1]).toMatchObject({ revision: 2 });
  expect(updateSavedRoll.mock.calls[1]?.[2]).toMatchObject({
    draft: { notation: "10d6" },
    expectedListRevision: 2,
  });
});
