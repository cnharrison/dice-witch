// @vitest-environment jsdom

import { ThemeProvider } from "@/components/theme-provider";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiceInput } from "./DiceInput";

afterEach(cleanup);

function renderInput(
  onRoll: () => void,
  overrides: Partial<ComponentProps<typeof DiceInput>> = {},
) {
  return render(
    <ThemeProvider defaultTheme="dark" storageKey="dice-input-test-theme">
      <DiceInput
        input="1d20"
        setInput={vi.fn()}
        isValid
        onRoll={onRoll}
        selectedChannel
        isRollReady
        {...overrides}
      />
    </ThemeProvider>,
  );
}

describe("DiceInput roll controls", () => {
  it("uses native disabled buttons until exact preparation is ready", () => {
    renderInput(vi.fn(), { isRollReady: false });

    const buttons = screen.getAllByRole("button", { name: "Roll dice" });
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => (button as HTMLButtonElement).disabled)).toBe(
      true,
    );
  });

  it("names every responsive text field and repeat chevron", () => {
    renderInput(vi.fn(), {
      rollTitle: "Initiative",
      onRollTitleChange: vi.fn(),
      timesToRepeat: 2,
      onTimesToRepeatChange: vi.fn(),
    });

    expect(
      screen.getAllByRole("textbox", { name: "Dice notation" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("textbox", { name: "Roll title" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("textbox", { name: "Times to repeat roll" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", {
        name: "Increase times to repeat roll",
      }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", {
        name: "Decrease times to repeat roll",
      }),
    ).toHaveLength(2);
  });

  it("supports keyboard activation when rolling is ready", async () => {
    const onRoll = vi.fn();
    const user = userEvent.setup();
    renderInput(onRoll);
    const button = screen.getAllByRole("button", { name: "Roll dice" })[1];
    if (button === undefined) throw new Error("Desktop roll button is missing");

    button.focus();
    await user.keyboard("{Enter}");

    expect(onRoll).toHaveBeenCalledOnce();
  });

  it("navigates roll history with Arrow Up and Arrow Down", async () => {
    const onHistoryPrevious = vi.fn();
    const onHistoryNext = vi.fn();
    const user = userEvent.setup();
    renderInput(vi.fn(), { onHistoryPrevious, onHistoryNext });
    const input = screen.getAllByRole("textbox", { name: "Dice notation" })[1];
    if (input === undefined) throw new Error("Desktop notation input is missing");

    input.focus();
    await user.keyboard("{ArrowUp}{ArrowDown}");

    expect(onHistoryPrevious).toHaveBeenCalledOnce();
    expect(onHistoryNext).toHaveBeenCalledOnce();
  });
});
