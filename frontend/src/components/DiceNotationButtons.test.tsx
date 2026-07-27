// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mobile: false }));

vi.mock("./dice-v4-3d/browser-media", () => ({
  useBrowserMediaQueryV4: () => mocks.mobile,
}));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import {
  countDiceNotation,
  decrementDiceNotation,
  DiceNotationButtons,
  incrementDiceNotation,
} from "./DiceNotationButtons";

function Harness({ initial = "" }: { initial?: string }) {
  const [input, setInput] = React.useState(initial);
  return (
    <>
      <output data-testid="notation">{input}</output>
      <DiceNotationButtons input={input} setInput={setInput} />
    </>
  );
}

beforeEach(() => {
  mocks.mobile = false;
});

afterEach(cleanup);

describe("dice notation quick controls", () => {
  it("increments and subtracts the most recent matching die term", () => {
    expect(incrementDiceNotation("", 6)).toBe("1d6");
    expect(incrementDiceNotation("2d6+3d8+4d6", 6)).toBe(
      "2d6+3d8+5d6",
    );
    expect(decrementDiceNotation("2d6+3d8+4d6", 6)).toBe(
      "2d6+3d8+3d6",
    );
    expect(decrementDiceNotation("1d6+3d8", 6)).toBe("3d8");
    expect(decrementDiceNotation("2d20kh1+1d6", 20)).toBe("1d20kh1+1d6");
    expect(countDiceNotation("2d6+3d8+4d6", 6)).toBe(6);
  });

  it("supports click, right-click, Down Arrow, and Minus on desktop", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const addD6 = screen.getByRole("button", { name: "Add d6" });

    await user.click(addD6);
    await user.click(addD6);
    expect(screen.getByTestId("notation").textContent).toBe("2d6");
    expect(addD6.querySelector("[data-die-count]")?.className).toContain("z-10");

    fireEvent.contextMenu(addD6);
    expect(screen.getByTestId("notation").textContent).toBe("1d6");

    fireEvent.keyDown(addD6, { key: "ArrowDown" });
    expect(screen.getByTestId("notation").textContent).toBe("");

    await user.click(addD6);
    fireEvent.keyDown(addD6, { key: "-" });
    expect(screen.getByTestId("notation").textContent).toBe("");
  });

  it("uses stable 44px minus/count/plus controls on mobile", async () => {
    mocks.mobile = true;
    const user = userEvent.setup();
    render(<Harness initial="2d6" />);

    const commonDice = screen.getByLabelText("Common dice");
    expect(commonDice.className).toContain("grid-cols-2");
    expect(commonDice.className).not.toContain("overflow-x-auto");
    expect(commonDice.children).toHaveLength(6);
    for (const control of commonDice.children) {
      expect(control.className).toContain("min-w-0");
    }

    const remove = screen.getByRole("button", { name: "Remove d6" });
    const add = screen.getByRole("button", { name: "Add d6" });
    expect(remove.className).toContain("h-11");
    expect(add.className).toContain("h-11");
    const count = screen.getByLabelText("2 d6 selected");
    expect(count.parentElement?.className).toContain("min-w-0");

    await user.click(remove);
    expect(screen.getByTestId("notation").textContent).toBe("1d6");
    await user.click(add);
    expect(screen.getByTestId("notation").textContent).toBe("2d6");

    const advanced = screen.getByRole("button", { name: "Advanced" });
    expect(advanced.className).toContain("h-11");
    await user.click(advanced);
    const mobileDialog = screen.getByRole("dialog", {
      name: "Advanced dice notation",
    });
    expect(mobileDialog.className).toContain("fixed");
    expect(screen.queryByText("Advanced notation")).toBeNull();
    expect(screen.queryByText("Close")).toBeNull();
    expect(screen.getByRole("button", { name: "Close advanced notation" }))
      .toBeDefined();
    expect(screen.getByRole("button", { name: "+", exact: true }).className).toContain(
      "h-11",
    );
    await user.click(screen.getByRole("tab", { name: "Modifiers" }));
    expect(screen.getByRole("button", { name: "Keep highest" }).className).toContain(
      "h-11",
    );
    await user.click(screen.getByRole("tab", { name: "Numbers" }));
    expect(screen.getByRole("button", { name: "7" }).className).toContain(
      "h-11",
    );
  });

  it("keeps desktop Advanced controls in compact tabs", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1d20+" />);

    expect(screen.queryByRole("region", { name: "Advanced dice notation" })).toBeNull();
    const advanced = screen.getByRole("button", { name: "Advanced" });
    const indicator = advanced.querySelector("[data-advanced-indicator]");
    expect(indicator?.getAttribute("class")).not.toContain("rotate-180");
    await user.click(advanced);

    const region = screen.getByRole("region", {
      name: "Advanced dice notation",
    });
    expect(region.className).toContain("min-h-0");
    expect(region.className).toContain("flex-1");
    expect(region.className).not.toContain("absolute");
    expect(screen.getByLabelText("Common dice")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add d6" })).toBeDefined();
    expect(screen.queryByRole("dialog", { name: "Advanced dice notation" })).toBeNull();
    expect(
      screen.getByRole("tablist", { name: "Advanced notation categories" }),
    ).toBeDefined();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(indicator?.getAttribute("class")).toContain("rotate-180");
    expect(screen.getByRole("button", { name: "Add d%" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Add dF" })).toBeDefined();
    await user.click(screen.getByRole("tab", { name: "Modifiers" }));
    expect(screen.getByRole("button", { name: "Keep highest" })).toBeDefined();
    expect(
      screen.getByText("Keeps the highest die result in the group."),
    ).toBeDefined();
    expect(
      screen.getByText("Rerolls matching results once."),
    ).toBeDefined();
    await user.click(screen.getByRole("tab", { name: "Numbers" }));
    await user.click(screen.getByRole("button", { name: "7" }));
    expect(screen.getByTestId("notation").textContent).toBe("1d20+7");

    await user.click(advanced);
    expect(screen.queryByRole("region", { name: "Advanced dice notation" })).toBeNull();
    expect(indicator?.getAttribute("class")).not.toContain("rotate-180");
  });

  it("maps reroll labels to the notation parser semantics", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1d20" />);

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(screen.getByRole("tab", { name: "Modifiers" }));
    await user.click(screen.getByRole("button", { name: "Reroll once" }));

    expect(screen.getByTestId("notation").textContent).toBe("1d20ro");
    expect(
      screen.getByRole("button", { name: "Reroll until no match" }),
    ).toBeDefined();
  });
});
