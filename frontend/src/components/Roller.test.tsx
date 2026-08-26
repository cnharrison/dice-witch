// @vitest-environment jsdom

import { parsePublicRenderModelV4 } from "@dice-witch/dice-v4-model";
import fixture from "./dice-v4-3d/fixtures/d6-r3.json";
import {
  MOBILE_ROLL_DISPLAY_MODE_STORAGE_KEY_V4,
  ROLL_DISPLAY_MODE_STORAGE_KEY_V4,
} from "./dice-v4-3d/roll-display-mode";
import { ThemeProvider } from "./theme-provider";
import type { RollPreparation, RollResponse } from "@/types/dice";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiceAnimation3DProps } from "./DiceAnimation3D";
import { RollerView, type RollerSlots } from "./Roller";

const testSlots = {
  ResizablePanelGroupSlot: ({ children }) => <div>{children}</div>,
  ResizablePanelSlot: ({ children, defaultSize }) => (
    <div data-panel-default-size={defaultSize}>{children}</div>
  ),
  ResizableHandleSlot: () => <div />,
  DiceNotationButtonsSlot: () => <div>Notation controls</div>,
  DiceAnimation3DSlot: ({
    blankFaces,
    onReadyChange,
    onUnavailable,
  }: DiceAnimation3DProps) => (
    <div data-testid="three-dice" data-blank-faces={String(blankFaces)}>
      <button type="button" onClick={() => onReadyChange?.(true)}>
        Complete 3D preparation
      </button>
      <button
        type="button"
        onClick={() => onUnavailable(new Error("WebGL context was lost"))}
      >
        Fail 3D renderer
      </button>
    </div>
  ),
} satisfies RollerSlots;

const rollResponse: RollResponse = {
  diceArray: [
    [
      {
        sides: 6,
        rolled: 6,
        value: 6,
        color: "#ff00ff",
        secondaryColor: "#111111",
        textColor: "#111111",
        icon: [],
      },
    ],
  ],
  resultArray: [{ output: "[6]", results: 6 }],
  appearanceIdentities: [["expression:0:repeat:0:definition:6:0:die:0"]],
  rerolledAppearanceIdentities: [],
  message: "6",
  renderedImage: {
    contentType: "image/png",
    width: 150,
    height: 150,
    base64: "iVBORw0KGgo=",
  },
  renderModel: parsePublicRenderModelV4(fixture),
};

const rollPreparation: RollPreparation = {
  renderSeed: 123,
  appearanceDigest: "a".repeat(64),
  groupSizes: [1],
  appearanceIdentities: [["expression:0:repeat:0:definition:6:0:die:1"]],
  renderedImage: rollResponse.renderedImage!,
  renderModel: rollResponse.renderModel,
};

function stubMatchMedia(mobile: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(max-width: 639px)" ? mobile : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function rollerElement(
  response: RollResponse | null = rollResponse,
  isPreparing = false,
  preparation: RollPreparation | null = null,
  isResultStale = false,
  mobileView: "controls" | "result" = "result",
): React.ReactElement {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="roller-test-theme">
      <RollerView
        slots={testSlots}
        rollPreparation={preparation}
        rollResults={response}
        isPreparing={isPreparing}
        isRolling={false}
        isResultStale={isResultStale}
        input="1d6"
        setInput={vi.fn()}
        selectedChannel
        mobileView={mobileView}
      />
    </ThemeProvider>
  );
}

function renderRoller(
  response: RollResponse | null = rollResponse,
  isPreparing = false,
): ReturnType<typeof render> {
  return render(rollerElement(response, isPreparing));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Roller V4 display modes", () => {
  it("shows the startup sparkle once, keeps the scene visible during later preparation, and persists a 2D choice", async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    const view = renderRoller();
    const { container } = view;

    expect(
      [...container.querySelectorAll("[data-panel-default-size]")].map(
        (panel) => panel.getAttribute("data-panel-default-size"),
      ),
    ).toEqual(["34", "66"]);
    expect(screen.getByRole("button", { name: "Show 3D dice" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("img", { name: "Rendered dice result" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Loading 3D dice");
    await user.click(
      await screen.findByRole("button", { name: "Complete 3D preparation" }),
    );
    expect(screen.queryByRole("status")).toBeNull();

    view.rerender(rollerElement(rollResponse, true));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("three-dice")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Show 2D dice" }));
    expect(screen.getByRole("img", { name: "Rendered dice result" })).toBeDefined();
    expect(screen.queryByTestId("three-dice")).toBeNull();
    expect(localStorage.getItem(ROLL_DISPLAY_MODE_STORAGE_KEY_V4)).toBe("2d");
  });

  it("renders only notation controls in the mobile Roll workspace", () => {
    stubMatchMedia(true);
    render(rollerElement(rollResponse, false, null, false, "controls"));

    expect(screen.getByText("Notation controls")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Show 2D dice" })).toBeNull();
    expect(screen.queryByText("[6]")).toBeNull();
  });

  it("defaults mobile results to 2D and allows an explicit 3D opt-in", async () => {
    stubMatchMedia(true);
    localStorage.setItem(ROLL_DISPLAY_MODE_STORAGE_KEY_V4, "3d");
    const user = userEvent.setup();
    renderRoller();

    const show2d = screen.getByRole("button", { name: "Show 2D dice" });
    const show3d = screen.getByRole("button", { name: "Show 3D dice" });
    expect(show2d.getAttribute("aria-pressed")).toBe("true");
    expect(show2d.className).toContain("h-11");
    expect(show3d.className).toContain("h-11");
    expect(screen.queryByTestId("three-dice")).toBeNull();

    await user.click(show3d);
    expect(await screen.findByTestId("three-dice")).toBeDefined();
    expect(localStorage.getItem(MOBILE_ROLL_DISPLAY_MODE_STORAGE_KEY_V4)).toBe("3d");
  });

  it("switches to authoritative 2D with a capability notice after WebGL failure", async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    renderRoller();

    await user.click(
      await screen.findByRole("button", { name: "Fail 3D renderer" }),
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "This browser could not continue displaying 3D dice",
    );
    expect(screen.getByRole("img", { name: "Rendered dice result" })).toBeDefined();
    expect(screen.queryByTestId("three-dice")).toBeNull();
    expect(screen.getByRole("button", { name: "Show 2D dice" }).getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(ROLL_DISPLAY_MODE_STORAGE_KEY_V4)).toBeNull();
  });

  it("clears a stale result and shows the blank preparation throw immediately", async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    const view = renderRoller();

    await user.click(
      await screen.findByRole("button", { name: "Complete 3D preparation" }),
    );
    expect(screen.getByText("[6]")).toBeDefined();

    view.rerender(rollerElement(rollResponse, true, rollPreparation, true));

    expect(screen.queryByText("[6]")).toBeNull();
    expect(screen.queryByText(/previous result/i)).toBeNull();
    expect(screen.getByTestId("three-dice").dataset.blankFaces).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the sparkle inside the empty 3D tray during initial preparation", () => {
    stubMatchMedia(false);
    renderRoller(null, true);

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading 3D dice");
    expect(status.querySelector('[data-loading-glyph="sparkles"]')).not.toBeNull();
    expect(screen.queryByText(/Preparing your exact dice/i)).toBeNull();
  });

  it("keeps consumer-before-producer V3 results silently available in 2D", () => {
    stubMatchMedia(false);
    const v3Response = { ...rollResponse };
    delete v3Response.renderModel;
    renderRoller(v3Response);

    expect(screen.getByRole("img", { name: "Rendered dice result" })).toBeDefined();
    expect(screen.queryByTestId("three-dice")).toBeNull();
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect(
      (screen.getByRole("button", { name: "Show 3D dice" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
