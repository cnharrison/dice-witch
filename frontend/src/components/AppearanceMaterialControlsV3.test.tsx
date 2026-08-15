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
  it("uses one readable material selector and one shared editor", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initial={recipe("chaotic")} />);

    expect(container.querySelectorAll("details")).toHaveLength(0);
    const mix = screen.getByRole("group", { name: "Material mix" });
    const selector = within(mix).getByRole("combobox", {
      name: "Material in mix",
    });
    expect(within(selector).getAllByRole("option")).toHaveLength(23);
    expect(
      within(selector).getByRole("option", {
        name: /Classic · Solid.*Uses one selected color/,
      }),
    ).toBeDefined();
    expect(
      within(selector).getByRole("option", {
        name: /Liquid core · Vortex.*Lightens selected colors/,
      }),
    ).toBeDefined();
    expect(
      within(selector).getByRole("option", {
        name: /Metal · Brass.*Adds its own colors/,
      }),
    ).toBeDefined();
    expect(within(mix).getAllByRole("slider")).toHaveLength(1);
    expect(screen.getAllByLabelText("Material")).toHaveLength(1);

    await user.selectOptions(selector, "2");
    expect(selector).toHaveProperty("value", "2");
    expect(
      screen.getByRole("heading", { name: "Edit Classic · Checkerboard" }),
    ).toBeDefined();
    expect(screen.getAllByLabelText("Material")).toHaveLength(1);
  });

  it("keeps material labels concise and puts rebalancing guidance in a tooltip", async () => {
    const user = userEvent.setup();
    render(<Harness initial={recipe("chaotic")} />);

    expect(screen.queryByText("Use")).toBeNull();
    expect(
      screen.queryByText(/Other shares rebalance automatically/i),
    ).toBeNull();
    await user.hover(
      screen.getByRole("button", { name: "About material share rebalancing" }),
    );
    expect(
      await screen.findByRole("tooltip", {
        name: "Other shares rebalance automatically to keep the mix at 100%.",
      }),
    ).toBeDefined();
  });

  it("gives one fixed material a full-width editor without a redundant mix", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole("group", { name: "Material mix" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Edit Classic · Gradient" }),
    ).toBeDefined();

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

  it("preserves selected colors and rebalances the remaining mix", async () => {
    const user = userEvent.setup();
    render(<Harness initial={recipe("chaotic")} />);

    expect(screen.getByText("Some materials alter colors")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Preserve colors" }));

    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    if (value.material.mode !== "weighted") {
      throw new Error("Weighted fixture is missing");
    }
    expect(value.material.options).toHaveLength(18);
    expect(
      value.material.options.some(({ value: material }) =>
        ["sharp-resin", "liquid-core", "glass", "metal"].includes(
          material.family,
        ),
      ),
    ).toBe(false);
    expect(
      value.material.options.reduce((sum, option) => sum + option.weight, 0),
    ).toBe(1000);
    expect(
      screen.queryByRole("button", { name: "Preserve colors" }),
    ).toBeNull();
  });

  it("redistributes one active share slider while keeping an exact 100% total", () => {
    render(<Harness initial={recipe("chaotic")} />);

    const mix = screen.getByRole("group", { name: "Material mix" });
    const slider = within(mix).getByRole("slider") as HTMLInputElement;
    expect(slider).toHaveProperty("value", "600");

    fireEvent.change(slider, { target: { value: "700" } });

    expect(within(mix).getByRole("slider")).toHaveProperty("value", "700");
    expect(within(mix).getByText("70%")).toBeDefined();
    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    if (value.material.mode !== "weighted") {
      throw new Error("Weighted fixture is missing");
    }
    expect(value.material.options[0]?.weight).toBe(700);
    expect(
      value.material.options.reduce((sum, option) => sum + option.weight, 0),
    ).toBe(1000);
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
    expect(within(mix).getAllByRole("slider")).toHaveLength(1);
    expect(within(mix).getByRole("slider")).toHaveProperty("value", "500");
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
