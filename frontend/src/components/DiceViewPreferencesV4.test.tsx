// @vitest-environment jsdom

import { DiceViewPreferencesV4 } from "@/components/DiceViewPreferencesV4";
import { createDefaultDiceViewPreferencesV4 } from "@dice-witch/dice-v4-model";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange, value };
}

describe("DiceViewPreferencesV4", () => {
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

    expect(
      screen.getByLabelText("Shared elevation").closest("fieldset"),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByText(/temporarily overrides elevation and azimuth/i),
    ).not.toBeNull();
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

  it("creates and removes per-target overrides and selects their preview", () => {
    const onPreviewTargetChange = vi.fn();
    const { onChange, value } = renderPreferences({ onPreviewTargetChange });
    const d20 = screen.getByLabelText("d20 viewing side");

    fireEvent.change(d20, { target: { value: "custom" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      azimuth: {
        ...value.azimuth,
        overrides: { d20: { mode: "custom", customDegrees: 0 } },
      },
    });
    expect(onPreviewTargetChange).toHaveBeenLastCalledWith("d20");

    fireEvent.change(d20, { target: { value: "inherit" } });
    expect(onChange).toHaveBeenLastCalledWith(value);
  });
});
