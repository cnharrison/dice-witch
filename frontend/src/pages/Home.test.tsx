// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
  toast: vi.fn(),
  guildsLoading: false,
}));

vi.mock("@/lib/AuthProvider", () => ({
  useUser: () => ({ user: { id: "100000000000000003" } }),
}));

vi.mock("@/context/GuildContext", () => ({
  useGuild: () => ({
    selectedGuildId: "100000000000000001",
    selectedChannelId: "100000000000000010",
    setSelectedGuildId: vi.fn(),
    setSelectedChannelId: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === "guilds"
      ? {
          data: [
            {
              id: "100000000000000001",
              name: "Fixture guild",
              icon: null,
              isAdmin: true,
              isDiceWitchAdmin: false,
            },
            {
              id: "100000000000000002",
              name: "Ordinary membership",
              icon: null,
              isAdmin: false,
              isDiceWitchAdmin: false,
            },
          ],
          isLoading: mocks.guildsLoading,
          isFetching: false,
        }
      : {
          data: {
            channels: [
              { id: "100000000000000010", name: "general", type: 0 },
            ],
          },
          isLoading: false,
          isFetching: false,
        },
}));

vi.mock("@/hooks/useDiceValidation", async () => {
  const ReactModule = await import("react");
  const validDiceInfo = { dice: 1 };
  return {
    useDiceValidation: () => {
      const [input, setInput] = ReactModule.useState("");
      const valid = input === "1d20";
      return {
        input,
        setInput,
        isValid: valid,
        validatedInput: input,
        diceInfo: valid ? validDiceInfo : null,
      };
    },
  };
});

vi.mock("@/components/GuildDropdown", () => ({
  GuildDropdown: ({ guilds }: { guilds: Array<{ name: string }> }) => (
    <div data-testid="guild-options">
      {guilds.map(({ name }) => name).join(",")}
    </div>
  ),
}));
vi.mock("@/components/ChannelDropdown", () => ({
  ChannelDropdown: () => <div>Channel selector</div>,
}));
vi.mock("@/components/LoadingMedia", () => ({ LoadingMedia: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/lib/config", () => ({
  appConfig: { inviteUrl: "https://example.com/invite" },
}));
vi.mock("../lib/api", () => ({ customFetch: mocks.customFetch }));
vi.mock("@/lib/roll-response", () => ({
  parseWebRollPreparation: (value: unknown) => value,
  parseWebRollResponse: (value: unknown) => value,
}));

vi.mock("@/components/Roller", () => ({
  Roller: ({
    isPreparing,
    rollPreparation,
    rollResults,
  }: {
    isPreparing: boolean;
    rollPreparation: unknown;
    rollResults: unknown;
  }) => (
    <div
      data-testid="roller"
      data-preparing={String(isPreparing)}
      data-has-preparation={String(rollPreparation !== null)}
      data-has-results={String(rollResults !== null)}
    />
  ),
}));

vi.mock("@/components/DiceInput", () => ({
  DiceInput: ({
    input,
    setInput,
    onRoll,
    isRollReady,
    timesToRepeat,
    onTimesToRepeatChange,
    rollTitle,
    onRollTitleChange,
  }: {
    input: string;
    setInput: (value: string) => void;
    onRoll: () => void;
    isRollReady: boolean;
    timesToRepeat: number;
    onTimesToRepeatChange: (value: number) => void;
    rollTitle: string;
    onRollTitleChange: (value: string) => void;
  }) => (
    <div
      data-testid="dice-input"
      data-input={input}
      data-repeat={String(timesToRepeat)}
      data-title={rollTitle}
    >
      <button type="button" onClick={() => setInput("1d20")}>
        Set valid notation
      </button>
      <button type="button" onClick={() => setInput("invalid")}>
        Set invalid notation
      </button>
      <button type="button" onClick={() => onRollTitleChange("Initiative")}>
        Set title
      </button>
      <button type="button" onClick={() => onTimesToRepeatChange(3)}>
        Set repeat count
      </button>
      <button type="button" onClick={onRoll} disabled={!isRollReady}>
        Roll now
      </button>
    </div>
  ),
}));

import { Home } from "./Home";

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
  diceArray: [[{ sides: 20, rolled: 20, icon: null }]],
  resultArray: [{ results: 20, output: "20" }],
  appearanceIdentities: preparation.appearanceIdentities,
  rerolledAppearanceIdentities: [],
  message: "20",
};

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  mocks.customFetch.mockReset();
  mocks.toast.mockReset();
  mocks.guildsLoading = false;
});

afterEach(cleanup);

describe("Home roll preparation lifecycle", () => {
  it("announces server loading without forcing reduced-motion animation", () => {
    mocks.guildsLoading = true;
    render(<Home />);

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading servers");
    expect(status.querySelector("svg")?.classList.contains("animate-spin")).toBe(
      false,
    );
    expect(
      status.querySelector("svg")?.classList.contains("motion-safe:animate-spin"),
    ).toBe(true);
  });

  it("does not expose ordinary mutual memberships as web-roll targets", () => {
    render(<Home />);

    expect(screen.getByTestId("guild-options").textContent).toBe(
      "Fixture guild",
    );
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
    expect(
      (screen.getByRole("button", { name: "Roll now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.click(retry);

    await waitFor(() =>
      expect(
        (screen.getByRole("button", {
          name: "Roll now",
        }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(attempts).toBe(2);
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
