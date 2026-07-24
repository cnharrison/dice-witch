// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceStringSelectionV3 } from "./AppearanceStringSelectionV3";

const options = [
  { id: "matte", name: "Matte" },
  { id: "enamel", name: "Enamel" },
  { id: "metallic", name: "Metallic" },
] as const;
const bounds = { minimum: 1, maximum: 1_000, step: 1 } as const;

afterEach(cleanup);

describe("AppearanceStringSelectionV3", () => {
  it("changes selection modes without losing explicit values or weights", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <AppearanceStringSelectionV3
        label="Engraving finish"
        selection={{ mode: "fixed", value: "matte" }}
        options={options}
        weightBounds={bounds}
        maximumTotalWeight={10_000}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Engraving finish mode"), "allowlist");
    expect(onChange).toHaveBeenLastCalledWith({
      mode: "allowlist",
      values: ["matte"],
    });

    rerender(
      <AppearanceStringSelectionV3
        label="Engraving finish"
        selection={{ mode: "allowlist", values: ["matte"] }}
        options={options}
        weightBounds={bounds}
        maximumTotalWeight={10_000}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Enamel" }));
    expect(onChange).toHaveBeenLastCalledWith({
      mode: "allowlist",
      values: ["matte", "enamel"],
    });
    rerender(
      <AppearanceStringSelectionV3
        label="Engraving finish"
        selection={{ mode: "allowlist", values: ["matte", "enamel"] }}
        options={options}
        weightBounds={bounds}
        maximumTotalWeight={10_000}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Engraving finish mode"), "weighted");
    expect(onChange).toHaveBeenLastCalledWith({
      mode: "weighted",
      options: [
        { value: "matte", weight: 500 },
        { value: "enamel", weight: 500 },
      ],
    });
  });

  it("uses linked percentage sliders and keeps selections non-empty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <AppearanceStringSelectionV3
        label="Engraving finish"
        selection={{
          mode: "weighted",
          options: [
            { value: "matte", weight: 1 },
            { value: "enamel", weight: 1 },
          ],
        }}
        options={options}
        weightBounds={bounds}
        maximumTotalWeight={10_000}
        disabledReasons={{ metallic: "Not compatible with this form" }}
        onChange={onChange}
      />,
    );

    expect(screen.queryByRole("checkbox", { name: "Metallic" })).toBeNull();
    expect(screen.queryByText("Not compatible with this form")).toBeNull();
    expect(
      screen.getByLabelText("Matte share").getAttribute("aria-valuetext"),
    ).toBe("50%");

    fireEvent.change(screen.getByLabelText("Matte share"), {
      target: { value: "700" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      mode: "weighted",
      options: [
        { value: "matte", weight: 700 },
        { value: "enamel", weight: 300 },
      ],
    });

    onChange.mockClear();
    rerender(
      <AppearanceStringSelectionV3
        label="Engraving finish"
        selection={{ mode: "allowlist", values: ["matte"] }}
        options={options}
        weightBounds={bounds}
        maximumTotalWeight={10_000}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Matte" }));
    expect(screen.getByRole("alert")).toHaveProperty(
      "textContent",
      "Select at least one engraving finish option.",
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
