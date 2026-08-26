// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { HomeView, type HomeDependencies } from "./Home";

const preparation = {
  renderSeed: 1,
  appearanceDigest: "a".repeat(64),
  groupSizes: [1],
  appearanceIdentities: [["expression:0:repeat:0:definition:20:0:die:0"]],
  renderedImage: {
    contentType: "image/png",
    width: 150,
    height: 150,
    base64: "iVBORw0KGgo=",
  },
};

const rollResult = {
  diceArray: [[{
    sides: 20,
    rolled: 20,
    value: 20,
    color: "#ff00ff",
    secondaryColor: "#000000",
    textColor: "#ffffff",
    icon: [],
  }]],
  resultArray: [{ results: 20, output: "20" }],
  appearanceIdentities: preparation.appearanceIdentities,
  rerolledAppearanceIdentities: [],
  renderedImage: preparation.renderedImage,
  message: "20",
};

type DiceInputProps = React.ComponentProps<HomeDependencies["DiceInputSlot"]>;
type GuildDropdownProps = React.ComponentProps<
  HomeDependencies["GuildDropdownSlot"]
>;
type LoadingMediaProps = React.ComponentProps<
  HomeDependencies["LoadingMediaSlot"]
>;
type RollerProps = React.ComponentProps<HomeDependencies["RollerSlot"]>;
type SavedRollQuickAccessProps = React.ComponentProps<
  HomeDependencies["SavedRollQuickAccessSlot"]
>;
type RollToast = ReturnType<HomeDependencies["useRollToast"]>;

function TestDiceInput({
  input,
  setInput,
  onRoll,
  isRollReady,
  timesToRepeat,
  onTimesToRepeatChange,
  rollTitle,
  onRollTitleChange,
  onHistoryPrevious,
  onHistoryNext,
}: DiceInputProps) {
  return (
    <div
      data-testid="dice-input"
      data-input={input}
      data-repeat={String(timesToRepeat)}
      data-title={rollTitle}
    >
      <input
        aria-label="Dice notation"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") onHistoryPrevious?.();
          else if (event.key === "ArrowDown") onHistoryNext?.();
          else if (event.key === "Enter" && isRollReady) onRoll?.();
        }}
      />
      <button type="button" onClick={() => setInput("1d20")}>
        Set valid notation
      </button>
      <button type="button" onClick={() => setInput("invalid")}>
        Set invalid notation
      </button>
      <button type="button" onClick={() => onRollTitleChange?.("Initiative")}>
        Set title
      </button>
      <button type="button" onClick={() => onTimesToRepeatChange?.(3)}>
        Set repeat count
      </button>
      <button type="button" onClick={onRoll} disabled={!isRollReady}>
        Roll now
      </button>
    </div>
  );
}

function TestGuildDropdown({ guilds }: GuildDropdownProps) {
  return (
    <div data-testid="guild-options">
      {guilds?.map((guild) => guild.guilds.name).join(",")}
    </div>
  );
}

function TestChannelDropdown() {
  return <div>Channel selector</div>;
}

function TestLoadingMedia({ staticImage, alt }: LoadingMediaProps) {
  return <img src={staticImage} alt={alt} />;
}

function TestRoller({
  isPreparing,
  rollPreparation,
  rollResults,
  mobileView,
}: RollerProps) {
  return (
    <div
      data-testid="roller"
      data-preparing={String(isPreparing)}
      data-has-preparation={String(rollPreparation !== null)}
      data-has-results={String(rollResults !== null)}
      data-mobile-view={mobileView}
    />
  );
}

function TestSavedRollQuickAccess({
  guildScope,
  onLoad,
  onRollNow,
}: SavedRollQuickAccessProps) {
  return (
    <div
      data-testid="saved-roll-guild-scope"
      data-guild-id={guildScope?.guildId ?? ""}
    >
      <button
        type="button"
        onClick={() => onLoad({
          notation: "4d8",
          title: "Saved damage",
          repetitions: 4,
        })}
      >
        Load saved draft
      </button>
      <button
        type="button"
        onClick={() => onLoad({
          notation: "1d20",
          title: "Saved attack",
          repetitions: 1,
        })}
      >
        Load valid saved draft
      </button>
      <button
        type="button"
        onClick={() => onRollNow({
          notation: "1d20",
          title: "Saved attack",
          repetitions: 1,
          libraryRoll: {
            scope: "personal",
            id: "123e4567-e89b-42d3-a456-426614174000",
            revision: 2,
          },
          libraryDisplayName: "Saved attack",
        })}
      >
        Roll saved draft now
      </button>
    </div>
  );
}

function TestSaveLibraryRollDialog() {
  return null;
}

function useTestDiceValidation() {
  const [input, setInput] = React.useState("");
  const isValid = input === "1d20";
  return {
    input,
    setInput,
    isValid,
    validatedInput: input,
    hasDiceInfo: isValid,
  };
}

function createHomeHarness() {
  const state = {
    guildsLoading: false,
    isMobile: false,
    selectedGuildId: "100000000000000001",
  };
  const customFetch = vi.fn<HomeDependencies["fetchResponse"]>();
  const toast = vi.fn<RollToast>();
  const dependencies: HomeDependencies = {
    useUserId: () => "100000000000000003",
    useGuildSelection: () => ({
      selectedGuildId: state.selectedGuildId,
      selectedChannelId: "100000000000000010",
      setSelectedGuildId: vi.fn(),
      setSelectedChannelId: vi.fn(),
    }),
    useDiceValidation: useTestDiceValidation,
    useIsMobile: () => state.isMobile,
    useRollerGuilds: () => ({
      data: [
        {
          guilds: {
            id: "100000000000000001",
            name: "Fixture guild",
            icon: "",
          },
          isAdmin: true,
          isDiceWitchAdmin: false,
          isRollable: true,
        },
        {
          guilds: {
            id: "100000000000000002",
            name: "Ordinary membership",
            icon: "",
          },
          isAdmin: false,
          isDiceWitchAdmin: false,
          isRollable: true,
        },
        {
          guilds: {
            id: "100000000000000004",
            name: "No usable channels",
            icon: "",
          },
          isAdmin: true,
          isDiceWitchAdmin: false,
          isRollable: false,
        },
      ],
      isLoading: state.guildsLoading,
      isFetching: false,
    }),
    useGuildChannels: () => [
      { id: "100000000000000010", name: "general", type: 0 },
    ],
    useRollToast: () => toast,
    fetchResponse: customFetch,
    DiceInputSlot: TestDiceInput,
    GuildDropdownSlot: TestGuildDropdown,
    ChannelDropdownSlot: TestChannelDropdown,
    RollerSlot: TestRoller,
    LoadingMediaSlot: TestLoadingMedia,
    SavedRollQuickAccessSlot: TestSavedRollQuickAccess,
    SaveLibraryRollDialogSlot: TestSaveLibraryRollDialog,
  };

  return {
    dependencies,
    customFetch,
    toast,
    get guildsLoading() {
      return state.guildsLoading;
    },
    set guildsLoading(value: boolean) {
      state.guildsLoading = value;
    },
    get isMobile() {
      return state.isMobile;
    },
    set isMobile(value: boolean) {
      state.isMobile = value;
    },
    get selectedGuildId() {
      return state.selectedGuildId;
    },
    set selectedGuildId(value: string) {
      state.selectedGuildId = value;
    },
  };
}

type JsonValue = z.input<ReturnType<typeof z.json>>;

const rollRequestSchema = z.object({
  notation: z.string().optional(),
  title: z.string().nullable().optional(),
  timesToRepeat: z.number().optional(),
  libraryRoll: z
    .object({
      scope: z.string(),
      id: z.string(),
      revision: z.number(),
    })
    .optional(),
  deliveryId: z.string().optional(),
});
type RollRequest = z.infer<typeof rollRequestSchema>;

function response(value: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseRollRequest(body: RequestInit["body"]): RollRequest {
  return rollRequestSchema.parse(JSON.parse(String(body)));
}

let mocks: ReturnType<typeof createHomeHarness>;

function Home() {
  return <HomeView dependencies={mocks.dependencies} />;
}

function stubMobile(): void {
  mocks.isMobile = true;
}

beforeEach(() => {
  mocks = createHomeHarness();
  window.localStorage.clear();
});

afterEach(cleanup);

describe("Home roll preparation lifecycle", () => {
  it("announces server loading without forcing reduced-motion animation", () => {
    mocks.guildsLoading = true;
    render(<Home />);

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading servers");
    const sparkles = status.querySelector('[data-loading-glyph="sparkles"]');
    expect(sparkles).toBeTruthy();
    expect(
      [...(sparkles?.querySelectorAll("path") ?? [])].every(
        (path) => path.getAttribute("fill") === "#ff00ff",
      ),
    ).toBe(true);
  });

  it("offers only mutual servers with usable channels as web-roll targets", () => {
    render(<Home />);

    expect(screen.getByTestId("guild-options").textContent).toBe(
      "Fixture guild,Ordinary membership",
    );
  });

  it("loads the selected ordinary member's server library in the Roller", () => {
    mocks.selectedGuildId = "100000000000000002";
    render(<Home />);

    expect(
      screen.getByTestId("saved-roll-guild-scope").getAttribute("data-guild-id"),
    ).toBe("100000000000000002");
  });

  it("renders the idle portrait from the bundled image asset", () => {
    render(<Home />);

    const portrait = screen.getByRole("img", { name: "Dice Witch" });
    expect(portrait.getAttribute("src")).toContain(
      "/src/assets/dice-witch-banner.webp",
    );
  });

  it("renders Save as the magenta brand action", () => {
    render(<Home />);

    expect(screen.getByRole("button", { name: "Save" }).className).toContain(
      "bg-brand",
    );
  });

  it("loads a saved roll into a detached local draft", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Load saved draft" }));
    await waitFor(() => {
      const input = screen.getByTestId("dice-input");
      expect(input.getAttribute("data-input")).toBe("4d8");
      expect(input.getAttribute("data-title")).toBe("Saved damage");
      expect(input.getAttribute("data-repeat")).toBe("4");
    });
  });

  it("navigates three recent rolls and restores the current draft", async () => {
    window.localStorage.setItem(
      "dice-witch-recent-rolls-v1:100000000000000003",
      JSON.stringify({
        version: 2,
        rolls: [
          { notation: "1d12", title: "Newest", repetitions: 1 },
          { notation: "1d10", title: null, repetitions: 2 },
          { notation: "1d8", title: "Oldest", repetitions: 3 },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByRole("button", { name: "Set invalid notation" }));
    await user.click(screen.getByRole("button", { name: "Set title" }));
    await user.click(screen.getByRole("button", { name: "Set repeat count" }));
    const notation = screen.getByRole("textbox", { name: "Dice notation" });

    notation.focus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByTestId("dice-input").dataset).toMatchObject({
      input: "1d10",
      repeat: "2",
      title: "",
    });
    await user.keyboard("{ArrowDown}");
    expect(screen.getByTestId("dice-input").dataset.input).toBe("1d12");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByTestId("dice-input").dataset).toMatchObject({
      input: "invalid",
      repeat: "3",
      title: "Initiative",
    });
  });

  it("restores saved-roll identity when recalling and running recent history", async () => {
    window.localStorage.setItem(
      "dice-witch-recent-rolls-v1:100000000000000003",
      JSON.stringify({
        version: 2,
        rolls: [{
          notation: "1d20",
          title: "Saved attack",
          repetitions: 1,
          libraryRoll: {
            scope: "personal",
            id: "123e4567-e89b-42d3-a456-426614174000",
            revision: 2,
            displayName: "Longsword",
          },
        }],
      }),
    );
    const rollBodies: RollRequest[] = [];
    mocks.customFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/dice/prepare") return Promise.resolve(response(preparation));
      if (path === "/api/dice/roll") {
        rollBodies.push(parseRollRequest(init?.body));
        return Promise.resolve(response(rollResult));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);
    const notation = screen.getByRole("textbox", { name: "Dice notation" });

    notation.focus();
    await user.keyboard("{ArrowUp}");
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement).disabled)
        .toBe(false),
    );
    await user.keyboard("{Enter}");

    await waitFor(() => expect(rollBodies).toHaveLength(1));
    expect(rollBodies[0]?.libraryRoll).toEqual({
      scope: "personal",
      id: "123e4567-e89b-42d3-a456-426614174000",
      revision: 2,
    });
  });

  it("preserves Library identity in a web Roll-now request", async () => {
    const rollBodies: RollRequest[] = [];
    mocks.customFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/dice/prepare") return Promise.resolve(response(preparation));
      if (path === "/api/dice/roll") {
        rollBodies.push(parseRollRequest(init?.body));
        return Promise.resolve(response(rollResult));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Roll saved draft now" }));

    await waitFor(() => expect(rollBodies).toHaveLength(1));
    expect(rollBodies[0]).toMatchObject({
      notation: "1d20",
      title: "Saved attack",
      timesToRepeat: 1,
      libraryRoll: {
        scope: "personal",
        id: "123e4567-e89b-42d3-a456-426614174000",
        revision: 2,
      },
    });
    await waitFor(() => {
      // SAFETY: The test controls this fixture and verifies its use in the scenario below.
      const stored = JSON.parse(
        window.localStorage.getItem(
          "dice-witch-recent-rolls-v1:100000000000000003",
        ) ?? "null",
      ) as { rolls?: unknown[] } | null;
      expect(stored?.rolls?.[0]).toMatchObject({
        libraryRoll: {
          scope: "personal",
          id: "123e4567-e89b-42d3-a456-426614174000",
          revision: 2,
          displayName: "Saved attack",
        },
      });
    });
  });

  it("moves focus to the staged notation so Enter rolls instead of loading again", async () => {
    mocks.customFetch.mockImplementation((path: string) => {
      if (path === "/api/dice/prepare") return Promise.resolve(response(preparation));
      if (path === "/api/dice/roll") return Promise.resolve(response(rollResult));
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);
    const notation = screen.getByRole("textbox", { name: "Dice notation" });
    Object.defineProperty(notation, "offsetParent", {
      configurable: true,
      value: document.body,
    });

    await user.click(
      screen.getByRole("button", { name: "Load valid saved draft" }),
    );
    await waitFor(() => expect(document.activeElement).toBe(notation));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mocks.customFetch).toHaveBeenCalledWith(
        "/api/dice/roll",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("uses mobile Roll, Library, and Result tabs without stacking the workspaces", async () => {
    stubMobile();
    mocks.customFetch.mockImplementation((path: string) => {
      if (path === "/api/dice/prepare") {
        return Promise.resolve(response(preparation));
      }
      if (path === "/api/dice/roll") {
        return Promise.resolve(response(rollResult));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);

    expect(screen.getByRole("button", { name: "Change roll destination" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Roll" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("roller").dataset.mobileView).toBe("controls");
    expect(screen.queryByRole("button", { name: "Load saved draft" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Library" }));
    await user.click(screen.getByRole("button", { name: "Load saved draft" }));
    expect(screen.getByRole("tab", { name: "Roll" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("dice-input").dataset.input).toBe("4d8");

    await user.click(screen.getByRole("button", { name: "Set valid notation" }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Roll now" }));

    expect(screen.getByRole("tab", { name: "Result" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("roller").dataset.mobileView).toBe("result");
    expect(screen.queryByTestId("dice-input")).toBeNull();
  });

  it("does not show preparation as busy for invalid notation", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(
      screen.getByRole("button", { name: "Set invalid notation" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("roller").dataset.preparing).toBe("false"),
    );
    expect(mocks.customFetch).not.toHaveBeenCalledWith(
      "/api/dice/prepare",
      expect.anything(),
    );
  });

  it("keeps Roll disabled until an exact preparation retry succeeds", async () => {
    let attempts = 0;
    mocks.customFetch.mockImplementation((path: string) => {
      if (path !== "/api/dice/prepare") {
        throw new Error(`Unexpected request: ${path}`);
      }
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? new Response(JSON.stringify({ error: "Preparation unavailable" }), {
              status: 503,
              headers: { "content-type": "application/json" },
            })
          : response(preparation),
      );
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(
      screen.getByRole("button", { name: "Set valid notation" }),
    );
    const retry = await screen.findByRole("button", { name: "Retry" });
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect(
      (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.click(retry);

    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", {
          name: "Roll now",
        }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(attempts).toBe(2);
  });

  it("focuses the visible notation input with the slash shortcut", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const notation = screen.getByRole("textbox", { name: "Dice notation" });
    Object.defineProperty(notation, "offsetParent", {
      configurable: true,
      value: document.body,
    });
    notation.blur();

    await user.keyboard("/");

    expect(document.activeElement).toBe(notation);
  });

  it("rolls with Cmd/Ctrl+Enter while the notation input is focused", async () => {
    mocks.customFetch.mockImplementation((path: string) => {
      if (path === "/api/dice/prepare") return Promise.resolve(response(preparation));
      if (path === "/api/dice/roll") return Promise.resolve(response(rollResult));
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Set valid notation" }));
    const notation = screen.getByRole("textbox", { name: "Dice notation" });
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    notation.focus();
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() =>
      expect(mocks.customFetch).toHaveBeenCalledWith(
        "/api/dice/roll",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("clears a successful draft while retaining the displayed result", async () => {
    mocks.customFetch.mockImplementation((path: string) => {
      if (path === "/api/dice/prepare") {
        return Promise.resolve(response(preparation));
      }
      if (path === "/api/dice/roll") {
        return Promise.resolve(response(rollResult));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Set valid notation" }));
    await user.click(screen.getByRole("button", { name: "Set title" }));
    await user.click(screen.getByRole("button", { name: "Set repeat count" }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Roll now" }));

    await waitFor(() =>
      expect(screen.getByTestId("roller").dataset.hasResults).toBe("true"),
    );
    expect(screen.getByTestId("dice-input").dataset).toMatchObject({
      input: "",
      repeat: "1",
      title: "",
    });
  });

  it("keeps the last prepared identities mounted while replacement notation is pending", async () => {
    mocks.customFetch.mockImplementation((path: string) => {
      if (path === "/api/dice/prepare") {
        return Promise.resolve(response(preparation));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Set valid notation" }));
    await waitFor(() =>
      expect(screen.getByTestId("roller").dataset.hasPreparation).toBe("true"),
    );
    await user.click(screen.getByRole("button", { name: "Set invalid notation" }));

    expect(screen.getByTestId("roller").dataset.hasPreparation).toBe("true");
  });

  it("preserves the last result while replacement notation is invalid", async () => {
    mocks.customFetch.mockImplementation((path: string) => {
      if (path === "/api/dice/prepare") {
        return Promise.resolve(response(preparation));
      }
      if (path === "/api/dice/roll") {
        return Promise.resolve(response(rollResult));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Set valid notation" }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Roll now" }));
    await waitFor(() =>
      expect(screen.getByTestId("roller").dataset.hasResults).toBe("true"),
    );

    await user.click(screen.getByRole("button", { name: "Set invalid notation" }));

    expect(screen.getByTestId("roller").dataset.hasResults).toBe("true");
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect(
      (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("retains the complete draft when rolling fails", async () => {
    mocks.customFetch.mockImplementation((path: string) => {
      if (path === "/api/dice/prepare") {
        return Promise.resolve(response(preparation));
      }
      if (path === "/api/dice/roll") {
        return Promise.reject(new Error("Roll unavailable"));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Set valid notation" }));
    await user.click(screen.getByRole("button", { name: "Set title" }));
    await user.click(screen.getByRole("button", { name: "Set repeat count" }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Roll now" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(screen.getByTestId("dice-input").dataset).toMatchObject({
      input: "1d20",
      repeat: "3",
      title: "Initiative",
    });
  });

  it.each([
    {
      status: 400,
      result: {
        diceArray: [],
        resultArray: [],
        appearanceIdentities: [],
        rerolledAppearanceIdentities: [],
        message: "Invalid notation",
        error: "Invalid notation",
      },
    },
    {
      status: 403,
      result: { ...rollResult, error: "PERMISSION_ERROR" },
    },
  ])("retains the complete draft for an HTTP $status roll failure", async ({
    status,
    result,
  }) => {
    mocks.customFetch.mockImplementation((path: string) => {
      if (path === "/api/dice/prepare") {
        return Promise.resolve(response(preparation));
      }
      if (path === "/api/dice/roll") {
        return Promise.resolve(response(result, status));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Set valid notation" }));
    await user.click(screen.getByRole("button", { name: "Set title" }));
    await user.click(screen.getByRole("button", { name: "Set repeat count" }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Roll now" }));

    await waitFor(() =>
      expect(screen.getByTestId("roller").dataset.hasResults).toBe("true"),
    );
    expect(screen.getByTestId("dice-input").dataset).toMatchObject({
      input: "1d20",
      repeat: "3",
      title: "Initiative",
    });
  });

  it("reuses one delivery identity while durable Discord delivery is pending", async () => {
    const rollBodies: RollRequest[] = [];
    let rollAttempts = 0;
    mocks.customFetch.mockImplementation(
      (path: string, init?: RequestInit) => {
        if (path === "/api/dice/prepare") {
          return Promise.resolve(response(preparation));
        }
        if (path === "/api/dice/roll") {
          rollBodies.push(parseRollRequest(init?.body));
          rollAttempts += 1;
          return Promise.resolve(
            rollAttempts === 1
              ? response({ error: "Discord delivery is pending" }, 503)
              : response(rollResult),
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    );
    const user = userEvent.setup();
    render(<Home />);

    await user.click(
      screen.getByRole("button", { name: "Set valid notation" }),
    );
    const rollButton = screen.getByRole("button", { name: "Roll now" });
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect((rollButton as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(rollButton);
    await waitFor(() => expect(rollBodies).toHaveLength(1));
    await user.click(rollButton);
    await waitFor(() => expect(rollBodies).toHaveLength(2));

    expect(rollBodies[0]?.deliveryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(rollBodies[1]?.deliveryId).toBe(rollBodies[0]?.deliveryId);
  });

  it("ignores a completed roll after notation invalidates its request", async () => {
    let resolveRoll: ((value: Response) => void) | undefined;
    mocks.customFetch.mockImplementation((path: string) => {
      if (path === "/api/dice/prepare") {
        return Promise.resolve(response(preparation));
      }
      if (path === "/api/dice/roll") {
        return new Promise<Response>((resolve) => {
          resolveRoll = resolve;
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(
      screen.getByRole("button", { name: "Set valid notation" }),
    );
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", {
          name: "Roll now",
        }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Roll now" }));
    await waitFor(() =>
      expect(mocks.customFetch).toHaveBeenCalledWith(
        "/api/dice/roll",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );

    await user.click(
      screen.getByRole("button", { name: "Set invalid notation" }),
    );
    resolveRoll?.(
      response({
        diceArray: [],
        resultArray: [],
        appearanceIdentities: [],
        rerolledAppearanceIdentities: [],
        message: "stale",
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("roller").dataset.hasResults).toBe("false"),
    );
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
