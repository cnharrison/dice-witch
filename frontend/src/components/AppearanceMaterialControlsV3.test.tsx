// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import type { AppearanceRecipeV3 } from "@dice-witch/dice-v4-model";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceMaterialControlsV3 } from "./AppearanceMaterialControlsV3";

function recipe(styleId = "pride"): AppearanceRecipeV3 {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return structuredClone(style.recipe);
}

function Harness({ initial = recipe() }: { initial?: AppearanceRecipeV3 }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <AppearanceMaterialControlsV3
        recipe={value}
        catalog={APPEARANCE_CATALOG_V3}
        onChange={setValue}
      />
      <output data-testid="recipe">{JSON.stringify(value)}</output>
    </>
  );
}

afterEach(cleanup);

describe("AppearanceMaterialControlsV3", () => {
  it("shows a selectable material list with one shared editor and no accordions", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initial={recipe("chaotic")} />);

    expect(container.querySelectorAll("details")).toHaveLength(0);
    const mix = screen.getByRole("group", { name: "Material mix" });
    const materialRows = within(mix).getAllByRole("button");
    expect(materialRows).toHaveLength(17);
    expect(materialRows[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByLabelText("Material")).toHaveLength(1);

    await user.click(materialRows[1] as HTMLButtonElement);
    expect(materialRows[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByLabelText("Material")).toHaveLength(1);
  });

  it("changes one fixed material while making its approved shape automatic", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText("Material"), "hollow-metal");

    expect(screen.getByLabelText("Construction")).toBeDefined();
    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    expect(value.material).toMatchObject({
      mode: "fixed",
      value: { family: "hollow-metal" },
    });
    expect(value.form.policy).toBe("material-default-v1");
    expect(screen.queryByText(/Polyhedral form/i)).toBeNull();
    expect(screen.queryByText(/Not authored/i)).toBeNull();
  });

  it("removes the selected material without exposing form compatibility copy", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(
      screen.getByLabelText("Material selection mode"),
      "allowlist",
    );
    await user.selectOptions(screen.getByLabelText("Material to add"), "hollow-metal");
    await user.click(screen.getByRole("button", { name: "Add material" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    expect(value.material).toMatchObject({
      mode: "allowlist",
      values: [{ family: "classic" }],
    });
    expect(value.form.policy).toBe("material-default-v1");
    expect(screen.queryByText(/Not authored/i)).toBeNull();
  });

  it("redistributes linked sliders while keeping an exact 100% total", () => {
    render(<Harness initial={recipe("chaotic")} />);

    const mix = screen.getByRole("group", { name: "Material mix" });
    const sliders = within(mix).getAllByRole("slider") as HTMLInputElement[];
    expect(sliders).toHaveLength(17);
    expect(sliders[0]).toHaveProperty("value", "400");

    fireEvent.change(sliders[0] as HTMLInputElement, {
      target: { value: "700" },
    });

    const updated = within(mix).getAllByRole("slider") as HTMLInputElement[];
    expect(updated[0]).toHaveProperty("value", "700");
    expect(updated.reduce((sum, slider) => sum + slider.valueAsNumber, 0)).toBe(
      1000,
    );
    expect(within(mix).getAllByText("70%")).toHaveLength(1);
  });

  it("adds bounded weighted materials without dropping existing choices", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(
      screen.getByLabelText("Material selection mode"),
      "weighted",
    );
    await user.selectOptions(screen.getByLabelText("Material to add"), "glass");
    await user.click(screen.getByRole("button", { name: "Add material" }));

    const mix = screen.getByRole("group", { name: "Material mix" });
    const sliders = within(mix).getAllByRole("slider") as HTMLInputElement[];
    expect(sliders.map(({ valueAsNumber }) => valueAsNumber)).toEqual([500, 500]);
    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    expect(value.material.mode).toBe("weighted");
    if (value.material.mode !== "weighted") {
      throw new Error("Weighted fixture is missing");
    }
    expect(
      value.material.options.map(({ value: material }) => material.family),
    ).toEqual(["classic", "glass"]);
  });
});
