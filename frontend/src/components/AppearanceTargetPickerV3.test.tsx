// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceTargetPickerV3 } from "./AppearanceTargetPickerV3";

const TARGET_NAMES = [
  "All dice",
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
  "Percentile",
  "Fudge",
  "Other",
] as const;

afterEach(cleanup);

describe("AppearanceTargetPickerV3", () => {
  it("renders an image-only target group and visually selects every die for ALL", () => {
    render(
      <AppearanceTargetPickerV3 value="all" onChange={vi.fn()} />,
    );

    const group = screen.getByRole("radiogroup", { name: "Appearance target" });
    const targets = TARGET_NAMES.map((name) =>
      screen.getByRole("radio", { name }),
    );
    expect(group.querySelectorAll("svg")).toHaveLength(8);
    const all = screen.getByRole("radio", { name: "All dice" });
    expect(all.textContent).toBe("ALL");
    expect(all.firstElementChild?.className).toContain("text-[10px]");
    for (const target of targets.slice(1)) {
      expect(target.textContent).toBe("");
      expect(target.getAttribute("data-highlighted")).toBe("true");
      expect(target.getAttribute("aria-checked")).toBe("false");
    }
    expect(targets[0]?.getAttribute("aria-checked")).toBe("true");
    expect(
      targets[5]?.querySelectorAll("path")[2]?.getAttribute("d"),
    ).toBe("M50 5v20m44 12-21 5m3 46L64 70M24 88l12-18M6 37l21 5");
    expect(screen.queryByText("Appearance target")).toBeNull();
    expect(screen.queryByText(/choose which dice/i)).toBeNull();
  });

  it("supports click and arrow-key selection without exposing disabled controls", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <AppearanceTargetPickerV3 value="d6" onChange={onChange} />,
    );

    const d6 = screen.getByRole("radio", { name: "d6" });
    const d8 = screen.getByRole("radio", { name: "d8" });
    expect(d6.getAttribute("aria-checked")).toBe("true");
    expect(d8.getAttribute("data-highlighted")).toBe("false");

    d6.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("d8");
    await user.click(screen.getByRole("radio", { name: "Percentile" }));
    expect(onChange).toHaveBeenLastCalledWith("percentile");

    rerender(
      <AppearanceTargetPickerV3 value="d6" disabled onChange={onChange} />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(10);
    expect(screen.getAllByRole("radio").every((radio) => radio.hasAttribute("disabled"))).toBe(
      true,
    );
  });
});

describe("AppearanceTargetPickerV3 overrides", () => {
  const baseProps = {
    value: "d20" as const,
    onChange: vi.fn(),
    overrideTargets: ["d20", "d6"] as readonly ("d20" | "d6")[],
    onEditOverride: vi.fn(),
    onDiscardOverride: vi.fn(),
  };

  it("marks own-design chips with a hint without changing their name", () => {
    render(<AppearanceTargetPickerV3 {...baseProps} />);
    const d20 = screen.getByRole("radio", { name: "d20" });
    expect(d20.getAttribute("aria-describedby")).toBe("d20-own-design-hint");
    expect(screen.getAllByText("Has its own design")).toHaveLength(2);
    const d10 = screen.getByRole("radio", { name: "d10" });
    expect(d10.getAttribute("aria-describedby")).toBeNull();
  });

  it("opens the edit/discard menu on right-click", async () => {
    const user = userEvent.setup();
    render(<AppearanceTargetPickerV3 {...baseProps} />);
    fireEvent.contextMenu(screen.getByRole("radio", { name: "d20" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Edit d20's design" }),
    );
    expect(baseProps.onEditOverride).toHaveBeenCalledWith("d20");
  });

  it("discards via the menu item and via keyboard Delete on a focused chip", async () => {
    const user = userEvent.setup();
    render(<AppearanceTargetPickerV3 {...baseProps} />);
    fireEvent.contextMenu(screen.getByRole("radio", { name: "d20" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Discard d20's design…" }),
    );
    expect(baseProps.onDiscardOverride).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("radio", { name: "d20" }), {
      key: "Delete",
    });
    expect(baseProps.onDiscardOverride).toHaveBeenCalledTimes(2);
    expect(baseProps.onDiscardOverride).toHaveBeenLastCalledWith("d20");
  });

  it("keeps own-design chips unhighlighted while editing ALL", () => {
    render(<AppearanceTargetPickerV3 {...baseProps} value="all" />);
    expect(
      screen.getByRole("radio", { name: "d20" }).getAttribute("data-highlighted"),
    ).toBe("false");
    expect(
      screen.getByRole("radio", { name: "d6" }).getAttribute("data-highlighted"),
    ).toBe("false");
    expect(
      screen.getByRole("radio", { name: "d10" }).getAttribute("data-highlighted"),
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "All dice" }).getAttribute("data-highlighted"),
    ).toBe("true");
  });

  it("never opens design actions for the ALL chip or non-override targets", () => {
    render(<AppearanceTargetPickerV3 {...baseProps} value="all" />);
    fireEvent.contextMenu(screen.getByRole("radio", { name: "All dice" }));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.contextMenu(screen.getByRole("radio", { name: "d4" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
