// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import type { AppearanceRecipeV3 } from "@dice-witch/dice-v4-model";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceTreatmentControlsV3 } from "./AppearanceTreatmentControlsV3";

function recipe(styleId: string): AppearanceRecipeV3 {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return structuredClone(style.recipe);
}

function Harness({ initial }: { initial: AppearanceRecipeV3 }) {
  const [value, setValue] = React.useState(initial);
  return (
    <AppearanceTreatmentControlsV3
      recipe={value}
      catalog={APPEARANCE_CATALOG_V3}
      onChange={setValue}
    />
  );
}

afterEach(cleanup);

describe("AppearanceTreatmentControlsV3", () => {
  it("shows only lighting fields meaningful to the selected mode", async () => {
    const user = userEvent.setup();
    render(<Harness initial={recipe("pride")} />);

    const primary = screen.getByRole("group", {
      name: "Primary appearance treatment",
    });
    expect(within(primary).getByLabelText("Lighting intensity")).toBeDefined();
    expect(within(primary).getByLabelText("Lighting direction")).toBeDefined();

    await user.selectOptions(within(primary).getByLabelText("Lighting mode"), "none");
    expect(within(primary).queryByLabelText("Lighting intensity")).toBeNull();
    expect(within(primary).queryByLabelText("Lighting direction")).toBeNull();

    await user.selectOptions(within(primary).getByLabelText("Lighting mode"), "facet");
    expect(within(primary).getByLabelText("Lighting intensity")).toBeDefined();
    expect(within(primary).queryByLabelText("Lighting direction")).toBeNull();
  });

  it("hides repeated gradients when the selected material cannot use them", () => {
    render(<Harness initial={recipe("glass-cannon")} />);

    const primary = screen.getByRole("group", {
      name: "Primary appearance treatment",
    });
    expect(
      within(primary).queryByRole("option", { name: "Repeated per side" }),
    ).toBeNull();
    expect(
      screen.queryByText(/Repeated gradients require classic gradient material/),
    ).toBeNull();
  });

  it("keeps weighted engraving and all five finishes under Advanced", async () => {
    const user = userEvent.setup();
    render(<Harness initial={recipe("pride")} />);

    const summary = screen.getByText("Advanced procedural controls");
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(false);
    await user.click(summary);
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(true);
    const engraving = screen.getByRole("group", { name: "Engraving finish" });
    expect(
      within(engraving)
        .getByLabelText("Engraving finish")
        .querySelectorAll("option"),
    ).toHaveLength(5);

    await user.selectOptions(
      screen.getByLabelText("Engraving finish mode"),
      "weighted",
    );
    expect(within(engraving).getAllByRole("checkbox")).toHaveLength(5);
    expect(
      screen.getByLabelText("Matte ink share").getAttribute("aria-valuetext"),
    ).toBe("100%");
  });
});
