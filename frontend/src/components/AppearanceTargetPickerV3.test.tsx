// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("radio", { name: "All dice" }).textContent).toBe(
      "ALL",
    );
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
