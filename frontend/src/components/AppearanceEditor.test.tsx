// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V2 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import type {
  AppearanceCatalogV2,
  AppearanceDesignV2,
  AppearanceProfileV2,
  GuildAppearanceProfileV2,
} from "@/types/appearance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceColorControls } from "./AppearanceColorControls";
import { AppearanceEditor } from "./AppearanceEditor";
import { AppearanceSurfaceControls } from "./AppearanceSurfaceControls";

vi.mock("@/lib/appearance", () => ({
  getAppearancePreview: vi.fn(async () => ({
    version: 2,
    contentType: "image/png",
    width: 150,
    height: 150,
    base64: "iVBORw0KGgo=",
  })),
}));

const catalog = structuredClone(
  APPEARANCE_CATALOG_V2,
) as AppearanceCatalogV2;
const PERSONAL_DESIGN_ID = "123e4567-e89b-42d3-a456-426614174000";
const NEW_DESIGN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function recipeFor(styleId: string): AppearanceRecipeV2 {
  const style = catalog.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return structuredClone(style.recipe);
}

function queryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderEditor(
  props: React.ComponentProps<typeof AppearanceEditor>,
): void {
  render(
    <QueryClientProvider client={queryClient()}>
      <AppearanceEditor {...props} />
    </QueryClientProvider>,
  );
}

function personalProfile(): AppearanceProfileV2 {
  return {
    version: 2,
    designs: [],
    assignments: {
      all: { source: "builtin", id: "chaotic" },
      overrides: {
        d20: { source: "builtin", id: "rose-palette" },
      },
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppearanceEditor", () => {
  it("derives treatment visibility from fixed and procedural selections", () => {
    const recipe = structuredClone(catalog.styles[0]!.recipe);
    recipe.fill = { mode: "fixed", value: { type: "solid" } };
    recipe.lighting.mode = {
      mode: "allowlist",
      values: ["none", "facet"],
    };
    const { rerender } = render(
      <AppearanceSurfaceControls recipe={recipe} onChange={vi.fn()} />,
    );
    expect(screen.queryByLabelText("Gradient scope")).toBeNull();
    expect(screen.getByRole("heading", { name: "Lighting" })).toBeDefined();
    expect(screen.queryByText(/Control how gradients/)).toBeNull();
    expect(screen.getByLabelText("Lighting intensity")).toBeDefined();
    expect(screen.queryByLabelText("Lighting direction")).toBeNull();

    const allowlist = structuredClone(recipe);
    allowlist.fill = {
      mode: "allowlist",
      values: [{ type: "solid" }, { type: "gradient" }],
    };
    allowlist.lighting.mode = {
      mode: "weighted",
      options: [
        { value: "none", weight: 1 },
        { value: "directional", weight: 1 },
      ],
    };
    rerender(
      <AppearanceSurfaceControls recipe={allowlist} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Gradient scope")).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Gradient & lighting" }),
    ).toBeDefined();
    expect(screen.getByLabelText("Lighting intensity")).toBeDefined();
    expect(screen.getByLabelText("Lighting direction")).toBeDefined();

    const weighted = structuredClone(allowlist);
    weighted.fill = {
      mode: "weighted",
      options: [
        { value: { type: "solid" }, weight: 1 },
        { value: { type: "gradient" }, weight: 1 },
      ],
    };
    rerender(
      <AppearanceSurfaceControls recipe={weighted} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Gradient direction")).toBeDefined();
  });

  it("keeps the native color picker mounted and explains color modes", () => {
    const recipe = recipeFor("pride");
    function Harness() {
      const [value, setValue] = React.useState(recipe);
      return <AppearanceColorControls recipe={value} onChange={setValue} />;
    }
    render(<Harness />);

    const colorInput = screen.getByLabelText(/Color 1/) as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#123456" } });

    expect(screen.getByLabelText(/Color 1/)).toBe(colorInput);
    expect(colorInput.value).toBe("#123456");
    expect(screen.getByRole("option", { name: "Tonal" })).toBeDefined();
    expect(
      (screen.getByRole("option", { name: "Random" }) as HTMLOptionElement)
        .value,
    ).toBe("vivid-random-pair");
    expect(screen.getByRole("option", { name: "Palette" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Explain Palette colors" }),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText("Color behavior"), {
      target: { value: "vivid-random-pair" },
    });
    expect(screen.queryByLabelText(/Color 1/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Explain Random colors" }),
    ).toBeDefined();
  });

  it("shows primary gradient and conditional lighting controls", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    expect(screen.getByLabelText("Gradient scope")).toBeDefined();
    expect(screen.getByLabelText("Gradient direction")).toBeDefined();
    expect(
      screen.getByRole("option", { name: "Repeated per side" }),
    ).toBeDefined();
    const previewPane = screen.getByRole("region", { name: "Preview" });
    expect(previewPane.getAttribute("data-expanded")).toBe("true");
    expect(previewPane.className).not.toContain("gradient");
    const previewClasses = previewPane.className.split(/\s+/);
    expect(previewClasses).toContain("bg-card");
    expect(previewClasses).toContain("dark:bg-select");
    expect(previewClasses).not.toContain("bg-[#170a16]");
    const previewStage = previewPane.querySelector("[aria-busy]");
    expect(previewStage?.className.split(/\s+/)).toContain("bg-background");
    expect((await screen.findByRole("img")).className).toContain("w-full");
    const lightingMode = screen.getByLabelText(
      "Lighting mode",
    ) as HTMLSelectElement;
    expect(screen.getByLabelText("Lighting intensity")).toBeDefined();
    expect(screen.getByLabelText("Lighting direction")).toBeDefined();

    await user.selectOptions(lightingMode, "none");
    expect(screen.queryByLabelText("Lighting intensity")).toBeNull();
    expect(screen.queryByLabelText("Lighting direction")).toBeNull();

    await user.selectOptions(lightingMode, "facet");
    expect(
      (screen.getByLabelText("Lighting intensity") as HTMLSelectElement).value,
    ).toBe("gentle");
    expect(
      screen.getAllByRole("option", { name: "Gentle" }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Lighting direction")).toBeNull();
  });

  it("features only curated presets and visually distinct patterns", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    expect(screen.getByText("Current design: Random")).toBeDefined();
    expect(screen.queryByText(/Save & apply uses/)).toBeNull();
    const preset = screen.getByLabelText("Preset") as HTMLSelectElement;
    expect(Array.from(preset.options, ({ text }) => text)).toEqual([
      "Dice Witch",
      "Pride",
      "Trans",
      "Ember",
      "Gold",
      "Verdant",
      "Ocean",
      "Monochrome",
      "Random",
    ]);
    const fill = screen.getByLabelText("Fill or pattern") as HTMLSelectElement;
    expect(Array.from(fill.options, ({ text }) => text)).toEqual([
      "Procedural mix",
      "Solid",
      "Gradient",
      "Checkerboard",
      "Dots",
      "Stripes",
      "Triangles",
      "Crosshatch",
    ]);

    await user.click(screen.getByRole("button", { name: "d20" }));
    expect(Array.from(preset.options, ({ text }) => text)).toEqual([
      "Dice Witch",
      "Pride",
      "Trans",
      "Ember",
      "Gold",
      "Verdant",
      "Ocean",
      "Monochrome",
      "Random",
      "Rose",
    ]);
    expect(Array.from(fill.options, ({ text }) => text)).toContain("Stars");

    await user.click(screen.getByRole("button", { name: "All dice" }));
    expect(Array.from(fill.options, ({ text }) => text)).not.toContain("Stars");
  });

  it("makes the first primary edit from a built-in fixed without overriding later Advanced choices", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    await user.click(screen.getByText("Advanced procedural controls"));
    const variation = screen.getByLabelText("Variation") as HTMLSelectElement;
    expect(variation.value).toBe("wild");

    await user.selectOptions(screen.getByLabelText("Fill or pattern"), "solid");
    expect(variation.value).toBe("fixed");
    expect(
      (screen.getByLabelText("Lighting intensity") as HTMLSelectElement).value,
    ).toBe("gentle");

    await user.selectOptions(variation, "wild");
    await user.selectOptions(
      screen.getByLabelText("Font", { selector: "select" }),
      "liberation-sans",
    );
    expect(variation.value).toBe("wild");
  });

  it("preserves an explicit first lighting choice from a built-in", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    const lightingStrength = screen.getByLabelText(
      "Lighting intensity",
    ) as HTMLSelectElement;
    await user.selectOptions(lightingStrength, "strong");

    expect(lightingStrength.value).toBe("strong");
  });

  it("labels weighted default selections as a procedural mix", () => {
    renderEditor({
      catalog,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    const fill = screen.getByLabelText("Fill or pattern") as HTMLSelectElement;
    const font = screen.getByLabelText("Font", {
      selector: "select",
    }) as HTMLSelectElement;
    expect(fill.selectedOptions[0]?.textContent).toBe("Procedural mix");
    expect(font.selectedOptions[0]?.textContent).toBe("Procedural mix");
  });

  it("saves a target override without changing the all-dice assignment", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "d20" }));
    await user.selectOptions(screen.getByLabelText("Preset"), "pride");
    await user.click(screen.getByRole("button", { name: "Apply preset" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]![0];
    expect(saved.assignments).toEqual({
      all: { source: "builtin", id: "chaotic" },
      overrides: {
        d20: { source: "builtin", id: "pride" },
      },
    });
  });

  it("applies one preset to all dice and clears every override", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.selectOptions(screen.getByLabelText("Preset"), "dice-witch");
    await user.click(screen.getByRole("button", { name: "Apply preset" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].assignments).toEqual({
      all: { source: "builtin", id: "dice-witch" },
      overrides: {},
    });
  });

  it("copies a personal design into an independent guild design", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(NEW_DESIGN_ID);
    const personalDesign: AppearanceDesignV2 = {
      id: PERSONAL_DESIGN_ID,
      name: "Night garden",
      recipe: structuredClone(catalog.styles[0]!.recipe),
    };
    const guildProfile: GuildAppearanceProfileV2 = {
      version: 2,
      mode: "default",
      designs: [],
      assignments: { all: null, overrides: {} },
    };
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 1, profile: guildProfile },
      kind: "guild",
      personalDesigns: [personalDesign],
      isSaving: false,
      onSave,
    });

    await user.selectOptions(
      screen.getByLabelText("Personal design to copy"),
      PERSONAL_DESIGN_ID,
    );
    await user.click(screen.getByRole("button", { name: "Copy to draft" }));
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]![0] as GuildAppearanceProfileV2;
    expect(saved.designs).toEqual([
      {
        id: NEW_DESIGN_ID,
        name: "Night garden",
        recipe: personalDesign.recipe,
      },
    ]);
    expect(saved.designs[0]!.recipe).not.toBe(personalDesign.recipe);
    expect(saved.assignments).toEqual({
      all: { source: "custom", id: NEW_DESIGN_ID },
      overrides: {},
    });
  });

  it("saves the selected guild styling mode", async () => {
    const user = userEvent.setup();
    const profile: GuildAppearanceProfileV2 = {
      version: 2,
      mode: "default",
      designs: [],
      assignments: { all: null, overrides: {} },
    };
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 2, profile },
      kind: "guild",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("radio", { name: /enforced/i }));
    await user.click(screen.getByRole("button", { name: "Save mode" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect((onSave.mock.calls[0]![0] as GuildAppearanceProfileV2).mode).toBe(
      "enforced",
    );
  });

  it("round-trips untouched native procedural treatment selections", async () => {
    const user = userEvent.setup();
    const recipe = structuredClone(catalog.styles[0]!.recipe);
    recipe.fill = {
      mode: "weighted",
      options: [
        { value: { type: "solid" }, weight: 3 },
        { value: { type: "gradient" }, weight: 2 },
      ],
    };
    recipe.gradient.scope = {
      mode: "allowlist",
      values: ["repeated", "die-wide"],
    };
    recipe.lighting.mode = {
      mode: "weighted",
      options: [
        { value: "none", weight: 1 },
        { value: "directional", weight: 2 },
      ],
    };
    const profile: AppearanceProfileV2 = {
      version: 2,
      designs: [
        {
          id: PERSONAL_DESIGN_ID,
          name: "Procedural design",
          recipe,
        },
      ],
      assignments: {
        all: { source: "custom", id: PERSONAL_DESIGN_ID },
        overrides: {},
      },
    };
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 2, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]![0] as AppearanceProfileV2;
    expect(saved.designs[0]?.recipe).toEqual(recipe);
  });

  it("requires an explicit upgrade before changing legacy V1 treatment", async () => {
    const user = userEvent.setup();
    const legacyRecipe = recipeFor("pride");
    legacyRecipe.compatibility = "legacy-v1";
    legacyRecipe.gradient = {
      colorSource: "resolved-pair",
      scope: { mode: "fixed", value: "repeated" },
      direction: { mode: "fixed", value: "top-to-bottom" },
    };
    legacyRecipe.lighting = {
      mode: { mode: "fixed", value: "facet" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    };
    const profile: AppearanceProfileV2 = {
      version: 2,
      designs: [
        {
          id: PERSONAL_DESIGN_ID,
          name: "Migrated design",
          recipe: legacyRecipe,
        },
      ],
      assignments: {
        all: { source: "custom", id: PERSONAL_DESIGN_ID },
        overrides: {},
      },
    };
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 2, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    expect(screen.getByText(/legacy appearance treatment/i)).toBeDefined();
    expect(
      (screen.getByLabelText("Gradient scope") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Lighting mode") as HTMLSelectElement).disabled,
    ).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "Upgrade material and lighting" }),
    );
    expect(
      (screen.getByLabelText("Gradient scope") as HTMLSelectElement).disabled,
    ).toBe(false);
    expect(screen.getByLabelText("Gradient scope")).toHaveProperty(
      "value",
      "die-wide",
    );
    expect(screen.getByLabelText("Lighting mode")).toHaveProperty(
      "value",
      "combined",
    );
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]![0] as AppearanceProfileV2;
    const upgradedRecipe = saved.designs[0]?.recipe;
    expect(upgradedRecipe).toMatchObject({
      compatibility: "native-v2",
      gradient: {
        colorSource: "full-palette",
        scope: { mode: "fixed", value: "die-wide" },
        direction: {
          mode: "fixed",
          value: "upper-left-to-lower-right",
        },
      },
      lighting: {
        mode: { mode: "fixed", value: "combined" },
        strength: { mode: "fixed", value: "gentle" },
        direction: { mode: "fixed", value: "upper-left" },
      },
    });
    expect(upgradedRecipe?.variation).toBe(legacyRecipe.variation);
    expect(upgradedRecipe?.varyBy).toBe(legacyRecipe.varyBy);
    expect(upgradedRecipe?.colors).toEqual(legacyRecipe.colors);
    expect(upgradedRecipe?.fill).toEqual(legacyRecipe.fill);
    expect(upgradedRecipe?.font).toEqual(legacyRecipe.font);
  });

  it("preserves legacy V1 treatment metadata when editing and saving", async () => {
    const user = userEvent.setup();
    const legacyRecipe = recipeFor("pride");
    legacyRecipe.compatibility = "legacy-v1";
    legacyRecipe.gradient = {
      colorSource: "resolved-pair",
      scope: { mode: "fixed", value: "repeated" },
      direction: { mode: "fixed", value: "top-to-bottom" },
    };
    legacyRecipe.lighting = {
      mode: { mode: "fixed", value: "facet" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    };
    const profile: AppearanceProfileV2 = {
      version: 2,
      designs: [
        {
          id: PERSONAL_DESIGN_ID,
          name: "Migrated design",
          recipe: legacyRecipe,
        },
      ],
      assignments: {
        all: { source: "custom", id: PERSONAL_DESIGN_ID },
        overrides: {},
      },
    };
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 2, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]![0] as AppearanceProfileV2;
    expect(saved.designs[0]?.recipe).toEqual(legacyRecipe);
  });

  it("uses native V2 material and lighting defaults for randomized drafts", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 1, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Randomize" }));
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]![0] as AppearanceProfileV2;
    expect(saved.designs[0]?.recipe).toMatchObject({
      version: 2,
      compatibility: "native-v2",
      colors: { mode: "vivid-random-pair" },
      fill: {
        mode: "weighted",
        options: [
          { value: { type: "gradient" }, weight: 600 },
          { value: { type: "pattern", patternId: "checkerboard" }, weight: 80 },
          { value: { type: "pattern", patternId: "dots" }, weight: 80 },
          { value: { type: "pattern", patternId: "stripes" }, weight: 80 },
          { value: { type: "pattern", patternId: "triangles" }, weight: 80 },
          { value: { type: "pattern", patternId: "crosshatch" }, weight: 80 },
        ],
      },
      gradient: {
        colorSource: "full-palette",
        scope: { mode: "fixed", value: "die-wide" },
        direction: {
          mode: "fixed",
          value: "upper-left-to-lower-right",
        },
      },
      lighting: {
        mode: { mode: "fixed", value: "combined" },
        strength: { mode: "fixed", value: "gentle" },
        direction: { mode: "fixed", value: "upper-left" },
      },
    });
  });

  it("configures non-empty treatment allowlists in collapsed advanced controls", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 1, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    expect(
      screen.getByRole("button", { name: "All dice" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    await user.click(screen.getByText("Advanced procedural controls"));
    await user.selectOptions(
      screen.getByLabelText("Gradient scope behavior"),
      "allowlist",
    );
    const repeated = screen.getByRole("checkbox", {
      name: "Repeated per side",
    });
    const wholeDie = screen.getByRole("checkbox", { name: "Whole die" });
    await user.click(repeated);
    await user.click(wholeDie);
    await user.click(repeated);
    expect((repeated as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]![0] as AppearanceProfileV2;
    expect(saved.designs[0]?.recipe.gradient.scope).toEqual({
      mode: "allowlist",
      values: ["repeated"],
    });
  });

  it("edits treatment shares with linked percentage sliders", async () => {
    const user = userEvent.setup();
    const recipe = structuredClone(catalog.styles[0]!.recipe);
    recipe.gradient.direction = {
      mode: "weighted",
      options: [
        { value: "top-to-bottom", weight: 3 },
        { value: "upper-left-to-lower-right", weight: 5 },
      ],
    };
    recipe.lighting.mode = {
      mode: "weighted",
      options: [
        { value: "combined", weight: 5 },
        { value: "facet", weight: 3 },
      ],
    };
    const originalFill = structuredClone(recipe.fill);
    const originalFont = structuredClone(recipe.font);
    const profile: AppearanceProfileV2 = {
      version: 2,
      designs: [
        {
          id: PERSONAL_DESIGN_ID,
          name: "Weighted treatment",
          recipe,
        },
      ],
      assignments: {
        all: { source: "custom", id: PERSONAL_DESIGN_ID },
        overrides: {},
      },
    };
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog,
      resource: { revision: 2, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByText("Advanced procedural controls"));
    const weight = screen.getByLabelText(
      "Upper left to lower right share",
    ) as HTMLInputElement;
    expect(weight.min).toBe("1");
    expect(weight.max).toBe("999");
    expect(weight.getAttribute("aria-valuetext")).toBe("62.5%");
    fireEvent.change(weight, { target: { value: "700" } });
    expect(weight.value).toBe("700");
    await user.click(screen.getByRole("checkbox", { name: "None" }));
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]![0] as AppearanceProfileV2;
    expect(saved.designs[0]?.recipe.gradient.direction).toEqual({
      mode: "weighted",
      options: [
        { value: "top-to-bottom", weight: 300 },
        { value: "upper-left-to-lower-right", weight: 700 },
      ],
    });
    expect(saved.designs[0]?.recipe.lighting.mode).toEqual({
      mode: "weighted",
      options: [
        { value: "combined", weight: 624 },
        { value: "facet", weight: 375 },
        { value: "none", weight: 1 },
      ],
    });
    expect(saved.designs[0]?.recipe.fill).toEqual(originalFill);
    expect(saved.designs[0]?.recipe.font).toEqual(originalFont);
  });

  it("surfaces save conflicts without changing the draft into a saved design", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {
      throw new Error("Appearance profile changed; reload and try again");
    });
    renderEditor({
      catalog,
      resource: { revision: 1, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Apply preset" }));

    const status = await screen.findByText(
      "Appearance profile changed; reload and try again",
    );
    expect(status.getAttribute("role")).toBe("status");
    expect((screen.getByLabelText("Design name") as HTMLInputElement).value).toBe(
      "Random",
    );
  });
});
