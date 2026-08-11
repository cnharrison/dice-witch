// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import {
  MATERIAL_FAMILIES_V4,
  type MaterialFamilyV4,
} from "@dice-witch/dice-v4-model";
import { createDefaultAppearanceMaterialV3 } from "@/lib/appearance-editor-v3";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceMaterialOptionV3 } from "./AppearanceMaterialOptionV3";

afterEach(cleanup);

function Harness({ family }: { family: MaterialFamilyV4 }) {
  const [material, setMaterial] = React.useState(() =>
    createDefaultAppearanceMaterialV3(family, APPEARANCE_CATALOG_V3),
  );
  return (
    <AppearanceMaterialOptionV3
      material={material}
      catalog={APPEARANCE_CATALOG_V3}
      repeatedGradient={false}
      onChange={setMaterial}
    />
  );
}

describe("AppearanceMaterialOptionV3", () => {
  it("shows pattern controls only for classic pattern material", async () => {
    const user = userEvent.setup();
    render(<Harness family="classic" />);

    const treatment = screen.getByLabelText("Classic treatment");
    expect(treatment.className).toContain("appearance-none");
    expect(treatment.className).toContain("pr-10");
    expect(treatment.parentElement?.className).toContain("relative");
    expect(screen.queryByLabelText("Classic pattern")).toBeNull();
    expect(screen.queryByLabelText("Clarity")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Classic treatment"), "pattern");
    expect(screen.getByLabelText("Classic pattern")).toBeDefined();
    expect(screen.getByLabelText("Texture scale")).toHaveProperty("min", "25");
    expect(screen.getByLabelText("Texture scale")).toHaveProperty("max", "400");
  });

  it("exposes only sharp-resin variants and bounded direct controls", () => {
    render(<Harness family="sharp-resin" />);

    expect(screen.getByLabelText("Resin style")).toBeDefined();
    expect(screen.getByLabelText("Inclusion")).toBeDefined();
    expect(screen.getByLabelText("Clarity")).toHaveProperty("min", "0");
    expect(screen.getByLabelText("Inclusion density")).toHaveProperty(
      "max",
      "100",
    );
    expect(screen.queryByLabelText("Metal")).toBeNull();
  });

  it("exposes hollow construction, metal, finish, and openness together", () => {
    render(<Harness family="hollow-metal" />);

    expect(screen.getByLabelText("Construction")).toBeDefined();
    expect(screen.getByLabelText("Metal")).toBeDefined();
    expect(screen.getByLabelText("Material finish")).toBeDefined();
    expect(screen.getByLabelText("Openness")).toBeDefined();
    expect(screen.queryByLabelText("Clarity")).toBeNull();
  });

  it("switches elemental styles atomically with their fixed defaults", async () => {
    const user = userEvent.setup();
    render(<Harness family="elemental" />);

    expect(screen.getAllByRole("slider")).toHaveLength(3);
    expect(screen.getByLabelText("Fissure density")).toHaveProperty("value", "30");
    expect(
      screen.getByLabelText("Fissure density").getAttribute("aria-valuetext"),
    ).toBe("Light");
    expect(screen.getByLabelText("Glow intensity")).toHaveProperty("value", "90");
    expect(
      screen.getByLabelText("Glow intensity").getAttribute("aria-valuetext"),
    ).toBe("Intense");
    expect(screen.getByLabelText("Crust scale")).toHaveProperty("value", "340");
    expect(
      screen.getByLabelText("Crust scale").getAttribute("aria-valuetext"),
    ).toBe("Coarse");

    await user.selectOptions(screen.getByLabelText("Elemental style"), "sand");
    expect(screen.getAllByRole("slider")).toHaveLength(3);
    expect(screen.getByLabelText("Dune scale")).toBeDefined();
    expect(screen.getByLabelText("Wind direction")).toBeDefined();
    expect(screen.getByLabelText("Grain size")).toBeDefined();

    await user.selectOptions(
      screen.getByLabelText("Elemental style"),
      "blue-sky",
    );
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(screen.getByLabelText("Cloud cover")).toBeDefined();
    expect(screen.getByLabelText("Horizon height")).toBeDefined();
    expect(screen.queryByLabelText("Cloud softness")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Elemental style"), "sunset");
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(screen.getByLabelText("Cloud cover")).toBeDefined();
  });

  it("exposes exactly three paint splatter controls", () => {
    render(<Harness family="paint" />);

    expect(screen.getAllByRole("slider")).toHaveLength(3);
    expect(screen.getByLabelText("Drop density")).toBeDefined();
    expect(screen.getByLabelText("Drop scale")).toBeDefined();
    expect(screen.getByLabelText("Streak length")).toBeDefined();
  });

  it.each(MATERIAL_FAMILIES_V4)(
    "uses qualitative sliders instead of raw numbers for %s",
    (family) => {
      render(<Harness family={family} />);

      expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
      const sliders = screen.getAllByRole("slider");
      expect(sliders.length).toBeGreaterThan(0);
      expect(
        sliders.every((slider) =>
          Boolean(slider.getAttribute("aria-valuetext")),
        ),
      ).toBe(true);
      expect(sliders.every((slider) => slider.className.includes("h-11"))).toBe(
        true,
      );
    },
  );
});
