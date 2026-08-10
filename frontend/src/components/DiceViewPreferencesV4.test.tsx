// @vitest-environment jsdom

import { DiceViewPreferencesV4 } from "@/components/DiceViewPreferencesV4";
import { createDefaultDiceViewPreferencesV4 } from "@dice-witch/dice-v4-model";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

function renderPreferences(
  overrides: Partial<Parameters<typeof DiceViewPreferencesV4>[0]> = {},
) {
  const onChange = vi.fn();
  const value = createDefaultDiceViewPreferencesV4();
  render(
    <DiceViewPreferencesV4
      value={value}
      selectedTarget="all"
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange, value };
}

describe("DiceViewPreferencesV4", () => {
  it("keeps concise mode guidance available on hover and focus", async () => {
    const user = userEvent.setup();
    renderPreferences();

    expect(screen.queryByText(/Set the shared camera angle/i)).toBeNull();
    expect(screen.queryByText(/Applies to non-spherical dice/i)).toBeNull();
    expect(screen.queryByText(/Random uses the approved camera positions/i)).toBeNull();

    await user.hover(screen.getByRole("button", { name: "About legacy dice view" }));
    expect(
      await screen.findByRole("tooltip", {
        name: "Points each rolled result toward you in a fixed 3D composition.",
      }),
    ).toBeDefined();

    const clearHelp = screen.getByRole("button", {
      name: "About clear dice view",
    });
    clearHelp.focus();
    expect(
      await screen.findByRole("tooltip", {
        name: "Uses a fixed physically resting view with the result upright.",
      }),
    ).toBeDefined();
    clearHelp.blur();
    await user.unhover(
      screen.getByRole("button", { name: "About legacy dice view" }),
    );
  });

  it("makes Legacy and Clear mutually exclusive without changing normal settings", () => {
    const { onChange, value } = renderPreferences();
    fireEvent.click(screen.getByLabelText("Use legacy dice view"));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, mode: "legacy" });

    onChange.mockClear();
    renderPreferences({ value: { ...value, mode: "legacy" }, onChange });
    fireEvent.click(screen.getAllByLabelText("Keep rolled results clear").at(-1)!);
    expect(onChange).toHaveBeenLastCalledWith({ ...value, mode: "clear" });
  });

  it("disables normal controls while a readability view is active", () => {
    const value = createDefaultDiceViewPreferencesV4();
    value.mode = "clear";
    renderPreferences({ value });

    const fieldset = screen.getByLabelText("Shared elevation").closest("fieldset");
    expect(fieldset).toHaveProperty("disabled", true);
    expect(fieldset?.className).toContain("disabled:cursor-not-allowed");
    expect(screen.queryByText(/temporarily overrides elevation and azimuth/i)).toBeNull();
  });

  it("updates All dice and clears target overrides", () => {
    const value = createDefaultDiceViewPreferencesV4();
    value.azimuth.overrides.d20 = { mode: "custom", customDegrees: 35 };
    const { onChange } = renderPreferences({ value });

    fireEvent.change(screen.getByLabelText("All dice viewing side"), {
      target: { value: "custom" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      azimuth: {
        all: { mode: "custom", customDegrees: 0 },
        overrides: {},
      },
    });
  });

  it("resets active azimuth modes while remembering custom values", () => {
    const value = createDefaultDiceViewPreferencesV4();
    value.azimuth.all = { mode: "custom", customDegrees: -25 };
    value.azimuth.overrides.d20 = { mode: "custom", customDegrees: 35 };
    const { onChange } = renderPreferences({ value });

    fireEvent.click(screen.getByRole("button", { name: "Reset all to random" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      azimuth: {
        all: { mode: "random", customDegrees: -25 },
        overrides: {
          d20: { mode: "random", customDegrees: 35 },
        },
      },
    });
  });

  it("shows only the selected target controls", () => {
    renderPreferences({ selectedTarget: "d8" });

    expect(screen.getByLabelText("d8 viewing side")).toBeDefined();
    expect(screen.queryByLabelText("d4 viewing side")).toBeNull();
    expect(screen.queryByLabelText("d20 viewing side")).toBeNull();
    expect(screen.queryByLabelText("All dice viewing side")).toBeNull();
    expect(screen.getByRole("button", { name: "Reset to random" })).toBeDefined();
  });

  it("switches an inherited target to Custom when its slider moves", () => {
    const { onChange, value } = renderPreferences({ selectedTarget: "d8" });
    const slider = screen.getByLabelText("d8 custom azimuth");

    expect(slider).toHaveProperty("disabled", false);
    fireEvent.change(slider, { target: { value: "25" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      azimuth: {
        ...value.azimuth,
        overrides: { d8: { mode: "custom", customDegrees: 25 } },
      },
    });
  });

  it("resets only the selected target to random", () => {
    const value = createDefaultDiceViewPreferencesV4();
    value.azimuth.overrides.d8 = { mode: "custom", customDegrees: 25 };
    const { onChange } = renderPreferences({ value, selectedTarget: "d8" });

    fireEvent.click(screen.getByRole("button", { name: "Reset to random" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      azimuth: {
        ...value.azimuth,
        overrides: { d8: { mode: "random", customDegrees: 25 } },
      },
    });
  });

  it("creates and removes per-target overrides", () => {
    const { onChange, value } = renderPreferences();
    const d20 = screen.getByLabelText("d20 viewing side");

    fireEvent.change(d20, { target: { value: "custom" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      azimuth: {
        ...value.azimuth,
        overrides: { d20: { mode: "custom", customDegrees: 0 } },
      },
    });
    fireEvent.change(d20, { target: { value: "inherit" } });
    expect(onChange).toHaveBeenLastCalledWith(value);
  });
});
