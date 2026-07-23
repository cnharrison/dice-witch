// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import type { AppearanceRecipeV3 } from "@dice-witch/dice-v4-model";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceRecipeControlsV3 } from "./AppearanceRecipeControlsV3";

function recipe(styleId: string): AppearanceRecipeV3 {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return structuredClone(style.recipe);
}

function Harness({ initial }: { initial: AppearanceRecipeV3 }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <AppearanceRecipeControlsV3
        recipe={value}
        catalog={APPEARANCE_CATALOG_V3}
        target="all"
        onChange={setValue}
      />
      <output data-testid="recipe">{JSON.stringify(value)}</output>
    </>
  );
}

afterEach(cleanup);

describe("AppearanceRecipeControlsV3", () => {
  it("shows one material list and shared editor after Customize", () => {
    render(<Harness initial={recipe("chaotic")} />);

    expect(
      screen.getByRole("group", {
        name: "Material: Weighted mix · 17 materials",
      }),
    ).toBeDefined();
    expect(screen.queryByText("Form")).toBeNull();
    expect(
      screen.queryByRole("group", { name: /Polyhedral/i }),
    ).toBeNull();
    expect(screen.queryByText("Advanced appearance controls")).toBeNull();
    expect(screen.getByLabelText("Material selection mode")).toHaveProperty(
      "value",
      "weighted",
    );
  });

  it("keeps the common font choice directly available", async () => {
    const user = userEvent.setup();
    render(<Harness initial={recipe("chaotic")} />);

    await user.selectOptions(screen.getByLabelText("Primary font"), "new-rocker");
    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    expect(value.font).toEqual({ mode: "fixed", value: "new-rocker" });
  });
});
