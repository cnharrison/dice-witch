// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import {
  createDefaultDiceViewPreferencesV4,
  type AppearanceProfileV4,
  type CustomAppearanceDesignV3,
  GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import { AppearanceApiError } from "@/lib/appearance-api-error";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppearanceEditorV3View,
  type AppearanceEditorV3Props,
} from "./AppearanceEditorV3";
import {
  AppearancePreviewPaneV3,
  AppearancePreviewPaneV3View,
} from "./AppearancePreviewPaneV3";

const getAppearancePreviewV4 = vi.fn(async () => ({
  version: 4 as const,
  contentType: "image/png" as const,
  width: 150,
  height: 150,
  base64: "iVBORw0KGgo=",
}));

function TestPreviewPane(
  props: React.ComponentProps<typeof AppearancePreviewPaneV3>,
) {
  return (
    <AppearancePreviewPaneV3View
      {...props}
      getPreview={getAppearancePreviewV4}
    />
  );
}

const designId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function personalProfile(): AppearanceProfileV4 {
  return {
    version: 4,
    designs: [],
    assignments: {
      all: { source: "builtin", id: "chaotic" },
      overrides: { d20: { source: "builtin", id: "hex-appeal" } },
    },
    diceView: createDefaultDiceViewPreferencesV4(),
  };
}

function personalProfileV4(): AppearanceProfileV4 {
  const profile = personalProfile();
  return {
    ...profile,
    diceView: createDefaultDiceViewPreferencesV4(),
  };
}

function styleRecipe(styleId: string) {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return structuredClone(style.recipe);
}

async function selectAppearanceTarget(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> {
  await user.click(screen.getByRole("radio", { name }));
}


function completeLooksRegion(): HTMLElement {
  return screen.getByRole("region", { name: "Complete looks" });
}

function catalogStyleName(styleId: string): string {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return style.name;
}

function startFromCard(styleId: string): HTMLElement {
  const region = APPEARANCE_CATALOG_V3.colorSchemeStyleIds.includes(styleId)
    ? screen.getByRole("group", { name: "Color schemes" })
    : completeLooksRegion();
  return within(region).getByRole("button", {
    name: new RegExp(catalogStyleName(styleId)),
  });
}

async function selectStartFromStyle(
  user: ReturnType<typeof userEvent.setup>,
  styleId: string,
): Promise<void> {
  const card = new RegExp(catalogStyleName(styleId));
  const region = APPEARANCE_CATALOG_V3.colorSchemeStyleIds.includes(styleId)
    ? screen.getByRole("group", { name: "Color schemes" })
    : completeLooksRegion();
  await user.click(within(region).getByRole("button", { name: card }));
}

function materialTile(name: string): HTMLElement {
  return within(screen.getByRole("region", { name: "Material" })).getByRole(
    "button",
    { name },
  );
}

type EditorProps = AppearanceEditorV3Props;
type EditorTestProps = Omit<
  EditorProps,
  "onReset" | "onRestore" | "resource"
> & {
  resource: Omit<EditorProps["resource"], "canRestorePreviousMix"> &
    Partial<Pick<EditorProps["resource"], "canRestorePreviousMix">>;
  onReset?: EditorProps["onReset"];
  onRestore?: EditorProps["onRestore"];
};

const resetTestProfile: EditorProps["onReset"] = async (
  profile,
  revision,
) => ({
  revision: revision + 1,
  profile: {
    ...profile,
    assignments: { all: null, overrides: {} },
  },
  canRestorePreviousMix: true,
});

const restoreTestProfile: EditorProps["onRestore"] = async (
  profile,
  revision,
) => ({
  revision: revision + 1,
  profile,
  canRestorePreviousMix: true,
});

function renderEditor(props: EditorTestProps): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onReset = props.onReset ?? resetTestProfile;
  const onRestore = props.onRestore ?? restoreTestProfile;
  render(
    <QueryClientProvider client={client}>
      <AppearanceEditorV3View
        PreviewPane={TestPreviewPane}
        {...props}
        resource={{ canRestorePreviousMix: false, ...props.resource }}
        onReset={onReset}
        onRestore={onRestore}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppearanceEditorV3", () => {
  it("shows named presets as matched, Rainbow as mixed, and Random as chaos", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    expect(
      screen.getByRole("button", { name: "Chaos" }).getAttribute("aria-pressed"),
    ).toBe("true");

    await selectStartFromStyle(user, "hollow-victory");
    expect(
      screen
        .getByRole("button", { name: "Matched set" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    await selectStartFromStyle(user, "rainbow");
    expect(
      screen
        .getByRole("button", { name: "Mixed bag" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "Matched set" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("keeps the preview rail visible beside every desktop target", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    const targetPicker = screen.getByRole("radiogroup", {
      name: "Appearance target",
    });
    const preview = screen.getByRole("region", { name: "Preview" });
    const variety = screen.getByRole("region", { name: "Variety" });
    const editor = preview.closest("section.grid");
    const stickyStack = preview.closest("aside");
    const designPanel = screen.getByRole("tabpanel", { name: "Design" });
    expect(editor?.className).toContain("xl:grid-cols");
    expect(stickyStack?.className).toContain("xl:sticky");
    expect(stickyStack?.className).toContain("xl:self-start");
    expect(stickyStack?.className).toContain("flex");
    expect(stickyStack?.className).toContain("gap-4");
    expect(stickyStack?.className).not.toContain("space-y-4");
    expect(stickyStack?.contains(targetPicker)).toBe(true);
    expect(stickyStack?.contains(variety)).toBe(true);
    expect(targetPicker.compareDocumentPosition(preview)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(variety.parentElement?.className).toContain("rounded-xl");
    expect(variety.parentElement?.className).toContain("bg-card");
    expect(designPanel.contains(targetPicker)).toBe(false);
    expect(designPanel.contains(variety)).toBe(false);
    expect(preview.compareDocumentPosition(variety)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const savedHeading = screen.getByRole("heading", { name: "Saved designs" });
    const newDesign = screen.getByRole("button", { name: "New design" });
    expect(stickyStack?.contains(savedHeading)).toBe(true);
    expect(savedHeading.parentElement?.parentElement?.contains(newDesign)).toBe(true);
    expect(designPanel.contains(newDesign)).toBe(false);

    await selectAppearanceTarget(user, "d20");
    expect(editor?.className).toContain("xl:grid-cols");
    expect(stickyStack?.className).toContain("xl:sticky");
  });

  it("opens a new design for editing inside Saved designs", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    const preview = screen.getByRole("region", { name: "Preview" });
    const heading = screen.getByRole("heading", { name: "Saved designs" });
    const newDesign = screen.getByRole("button", { name: "New design" });
    const stickyStack = preview.closest("aside");
    expect(stickyStack?.contains(heading)).toBe(true);
    expect(heading.parentElement?.parentElement?.contains(newDesign)).toBe(true);
    expect(screen.getByText("No saved designs.")).toBeDefined();
    expect(preview.compareDocumentPosition(heading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    await user.click(newDesign);
    const nameInput = screen.getByLabelText("Custom design name");
    const savedCard = heading.closest(".appearance-editor-saved-card");
    const designPanel = screen.getByRole("tabpanel", { name: /^Design/ });
    expect(savedCard?.contains(nameInput)).toBe(true);
    expect(designPanel.contains(nameInput)).toBe(false);
    expect(screen.getByRole("button", { name: "Done" })).toBeDefined();
  });

  it("opens Design when editing a saved design from another tab", async () => {
    const user = userEvent.setup();
    const profile = personalProfileV4();
    profile.designs = [
      { id: designId, name: "Night garden", recipe: styleRecipe("solid") },
    ];
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 5, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    const designTab = screen.getByRole("tab", { name: "Design" });
    const savedToggle = screen.getByRole("button", {
      name: "Saved designs, 1 total",
    });
    expect(savedToggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(savedToggle);
    expect(
      screen
        .getByRole("button", { name: "Hide saved designs, 1 total" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    await user.click(screen.getByRole("tab", { name: "Camera" }));
    expect(designTab.getAttribute("aria-selected")).toBe("false");
    await user.click(screen.getByRole("button", { name: "Edit Night garden" }));

    expect(designTab.getAttribute("aria-selected")).toBe("true");
    const nameInput = screen.getByLabelText("Custom design name");
    const savedHeading = screen.getByRole("heading", { name: "Saved designs" });
    const savedCard = savedHeading.closest(".appearance-editor-saved-card");
    const designPanel = screen.getByRole("tabpanel", { name: "Design" });
    expect(nameInput).toHaveProperty("value", "Night garden");
    expect(savedCard?.contains(nameInput)).toBe(true);
    expect(designPanel.contains(nameInput)).toBe(false);
    expect(document.activeElement).toBe(nameInput);

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
    const editButton = screen.getByRole("button", { name: "Edit Night garden" });
    expect(editButton).toBeDefined();
    expect(document.activeElement).toBe(editButton);
  });

  it("keeps one preview mounted while switching between Design and Camera tabs", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfileV4() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    const preview = screen.getByRole("region", { name: "Preview" });
    const designTab = screen.getByRole("tab", { name: "Design" });
    const cameraTab = screen.getByRole("tab", { name: "Camera" });
    expect(designTab.getAttribute("aria-selected")).toBe("true");
    const completeLooks = screen.getByRole("region", { name: "Complete looks" });
    const fineTune = screen.getByRole("button", { name: "Fine-tune →" });
    expect(
      fineTune.compareDocumentPosition(completeLooks) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.queryByRole("region", { name: "Dice view" })).toBeNull();

    await user.click(cameraTab);
    expect(cameraTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: "Dice view" })).toBeDefined();
    expect(screen.queryByRole("region", { name: "Complete looks" })).toBeNull();
    expect(screen.getByRole("region", { name: "Preview" })).toBe(preview);

    cameraTab.focus();
    await user.keyboard("{ArrowLeft}");
    expect(designTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(designTab);

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(cameraTab);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(designTab);
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(designTab);
    expect(screen.getByRole("region", { name: "Preview" })).toBe(preview);
  });

  it("keeps the picker target authoritative while Camera controls change", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfileV4() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    const all = screen.getByRole("radio", { name: "All dice" });
    await user.click(screen.getByRole("tab", { name: "Camera" }));
    await user.selectOptions(screen.getByLabelText("d4 viewing side"), "custom");
    expect(all.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("img", { name: "All dice appearance preview" })).toBeDefined();
    await user.selectOptions(screen.getByLabelText("d4 viewing side"), "random");
    expect(all.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("img", { name: "All dice appearance preview" })).toBeDefined();

    const d8 = screen.getByRole("radio", { name: "d8" });
    await user.click(d8);
    expect(screen.getByLabelText("d8 viewing side")).toBeDefined();
    expect(screen.queryByLabelText("d4 viewing side")).toBeNull();
    await waitFor(() =>
      expect(getAppearancePreviewV4).toHaveBeenLastCalledWith(
        expect.objectContaining({ target: "d8" }),
        expect.any(AbortSignal),
      ),
    );
    await user.click(screen.getByLabelText("Use legacy dice view"));
    expect(d8.getAttribute("aria-checked")).toBe("true");
    await waitFor(() =>
      expect(getAppearancePreviewV4).toHaveBeenLastCalledWith(
        expect.objectContaining({ target: "d8" }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("keeps the mobile preview available as one collapsible panel", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfileV4() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    const preview = screen.getByRole("region", { name: "Preview" });
    const hidePreview = screen.getByRole("button", { name: "Hide preview" });
    expect(hidePreview.getAttribute("aria-expanded")).toBe("true");
    await user.click(hidePreview);

    const showPreview = screen.getByRole("button", { name: "Show preview" });
    expect(showPreview.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("personal-appearance-preview")?.className).toContain("hidden");
    expect(screen.getByRole("region", { name: "Preview" })).toBe(preview);
  });

  it("creates a source-named custom design for a color-scheme edit", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    expect(screen.queryByRole("button", { name: "Customize" })).toBeNull();
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
    expect(screen.getByRole("region", { name: "Colors" })).toBeDefined();
    expect(screen.queryByRole("tab", { name: /Design, unsaved/ })).toBeNull();

    await selectStartFromStyle(user, "pride");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Based on Pride")).toBeDefined();
    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Pride edit",
    );

    await user.click(materialTile("Glass"));

    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Pride edit",
    );
    expect(screen.getByRole("tab", { name: "Design, unsaved changes" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
    expect(startFromCard("chaotic").getAttribute("aria-pressed")).toBe("true");
  });

  it("applies Pride colors without replacing a complete look's material", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await selectStartFromStyle(user, "heavy-metal");
    const heavyMetal = styleRecipe("heavy-metal");
    await selectStartFromStyle(user, "pride");
    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Pride edit",
    );
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());

    const saved = onSave.mock.calls[0]?.[0].designs[0]?.recipe;
    expect(saved?.colors).toEqual(styleRecipe("pride").colors);
    expect(saved?.colorDistribution).toBe("coordinated");
    expect(saved?.material).toEqual(heavyMetal.material);
  });

  it("opens the second-color picker for a saved full-spectrum design", async () => {
    const user = userEvent.setup();
    const profile = personalProfileV4();
    const recipe = styleRecipe("chaotic");
    recipe.variation = "fixed";
    const primary = APPEARANCE_CATALOG_V3.editorDefaults.primaryColor;
    const secondary = APPEARANCE_CATALOG_V3.editorDefaults.palette.find(
      (color) => color !== primary,
    );
    if (secondary === undefined) throw new Error("editor palette needs two colors");
    profile.designs = [
      {
        id: designId,
        name: "Codex check this out",
        recipe,
      },
    ];
    profile.assignments.all = { source: "custom", id: designId };
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Add palette color" }));

    expect(screen.getByRole("dialog", { name: "Palette color 2" }))
      .toBeDefined();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].designs[0]?.recipe.colors).toEqual({
      mode: "palette",
      colors: [primary, secondary],
    });
    expect(onSave.mock.calls[0]?.[0].designs[0]?.recipe.randomization)
      .toBeUndefined();
  });

  it("applies every Classic control from a gradient design", async () => {
    const user = userEvent.setup();
    const profile = personalProfileV4();
    const recipe = styleRecipe("solid");
    if (
      recipe.material.mode !== "fixed" ||
      recipe.material.value.family !== "classic"
    ) {
      throw new Error("Solid style must use fixed Classic material");
    }
    recipe.material = {
      mode: "fixed",
      value: { ...recipe.material.value, treatment: "gradient" },
    };
    profile.designs = [{ id: designId, name: "Classic controls", recipe }];
    profile.assignments = {
      all: { source: "custom", id: designId },
      overrides: {},
    };
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.selectOptions(screen.getByLabelText("Classic treatment"), "pattern");
    await user.selectOptions(screen.getByLabelText("Opacity"), "translucent");
    await user.selectOptions(screen.getByLabelText("Material finish"), "matte");
    expect(screen.getByLabelText("Classic treatment")).toHaveProperty(
      "value",
      "pattern",
    );
    expect(screen.getByLabelText("Opacity")).toHaveProperty(
      "value",
      "translucent",
    );
    expect(screen.getByLabelText("Material finish")).toHaveProperty(
      "value",
      "matte",
    );

    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].designs[0]?.recipe.material).toMatchObject({
      mode: "fixed",
      value: {
        family: "classic",
        treatment: "pattern",
        opacity: "translucent",
        finish: "matte",
      },
    });
  });

  it("edits Random as one weighted segment per material family", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    const bar = screen.getByRole("group", { name: "Material mix balance" });
    const titles = Array.from(bar.children, (segment) =>
      segment.getAttribute("title"),
    );
    expect(new Set(titles).size).toBe(titles.length);

    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    fireEvent.keyDown(screen.getAllByRole("slider")[0] as HTMLElement, {
      key: "ArrowLeft",
    });
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]?.[0];
    const material = saved?.designs[0]?.recipe.material;
    if (material?.mode !== "weighted") throw new Error("expected weighted");
    const families = material.options.map(({ value }) => value.family);
    expect(new Set(families).size).toBe(families.length);
  });

  it("keeps preset and Camera changes in one Save & apply transaction", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfileV4() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("tab", { name: "Camera" }));
    await user.click(screen.getByLabelText("Keep rolled results clear"));
    await user.click(screen.getByRole("tab", { name: "Design" }));
    await selectStartFromStyle(user, "dice-witch");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved changes: Design and Camera.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      assignments: {
        all: { source: "builtin", id: "dice-witch" },
        overrides: { d20: { source: "builtin", id: "hex-appeal" } },
      },
      diceView: { mode: "clear" },
    });
  });

  it("preserves custom Design and Camera drafts through one save", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfileV4() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await selectStartFromStyle(user, "pride");
    await user.click(materialTile("Glass"));
    await user.clear(screen.getByLabelText("Custom design name"));
    await user.type(screen.getByLabelText("Custom design name"), "Combined draft");

    await user.click(screen.getByRole("tab", { name: "Camera" }));
    await user.click(screen.getByLabelText("Keep rolled results clear"));
    expect(screen.getByText("Unsaved changes: Design and Camera.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      diceView: { mode: "clear" },
      designs: [{ id: designId, name: "Combined draft" }],
    });
  });

  it("stages preset choices until Save & apply", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await selectStartFromStyle(user, "dice-witch");
    expect(onSave).not.toHaveBeenCalled();
    await selectStartFromStyle(user, "chaotic");
    expect(screen.queryByRole("button", { name: "Save & apply" })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("replaces an automatic draft and changes variety without confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    await user.click(screen.getByRole("button", { name: "Mixed bag" }));
    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Random edit",
    );
    await selectStartFromStyle(user, "grain-expectations");
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
    expect(startFromCard("grain-expectations").getAttribute("aria-pressed"))
      .toBe("true");

    await user.click(screen.getByRole("button", { name: "Matched set" }));
    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Figured Walnut edit",
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it("preserves staged Design changes across die targets", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await selectAppearanceTarget(user, "d20");
    await selectStartFromStyle(user, "pride");
    await selectAppearanceTarget(user, "All dice");
    await selectStartFromStyle(user, "dice-witch");
    await selectAppearanceTarget(user, "d20");
    expect(startFromCard("pride").getAttribute("aria-pressed")).toBe("true");
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.assignments).toMatchObject({
      all: { source: "builtin", id: "dice-witch" },
      overrides: { d20: { source: "custom" } },
    });
    const d20 = saved.assignments.overrides.d20;
    expect(
      saved.designs.find(({ id }) => id === d20?.id)?.recipe.colors,
    ).toEqual(styleRecipe("pride").colors);
  });

  it("stages a target preset without changing the All dice assignment", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await selectAppearanceTarget(user, "d20");
    await selectStartFromStyle(user, "pride");
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.assignments).toMatchObject({
      all: { source: "builtin", id: "chaotic" },
      overrides: { d20: { source: "custom" } },
    });
    const d20 = saved.assignments.overrides.d20;
    expect(
      saved.designs.find(({ id }) => id === d20?.id)?.recipe.colors,
    ).toEqual(styleRecipe("pride").colors);
  });

  it("stages saved-design assignment and deletion until Save & apply", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const profile = personalProfile();
    profile.designs = [{ id: designId, name: "Night garden", recipe: styleRecipe("pride") }];
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Use Night garden" }));
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete Night garden" }));
    expect(screen.getByText("Night garden").className).toContain("line-through");
    expect(
      screen.getByRole("button", { name: "Undo deleting Night garden" }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Use Night garden" })).toBeNull();
    expect(screen.getByText(/Deleting Night garden returns All dice/)).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Night garden")).toBeDefined();
  });

  it("restores a staged deletion with its target assignment", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const profile = personalProfile();
    profile.designs = [
      { id: designId, name: "Night garden", recipe: styleRecipe("pride") },
    ];
    profile.assignments = {
      all: { source: "custom", id: designId },
      overrides: {},
    };
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Delete Night garden" }));
    expect(screen.getByText("0 of 10 used")).toBeDefined();

    await user.click(
      screen.getByRole("button", { name: "Undo deleting Night garden" }),
    );
    expect(screen.getByText("1 of 10 used")).toBeDefined();
    expect(screen.getByText("Night garden").className).not.toContain(
      "line-through",
    );
    expect(screen.queryByText(/Deleting Night garden/)).toBeNull();
    expect(screen.getByRole("button", { name: "Use Night garden" })).toBeDefined();

    expect(screen.queryByRole("button", { name: "Save & apply" })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("edits an unassigned saved design without assigning it to the current target", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const profile = personalProfile();
    profile.designs = [
      { id: designId, name: "Night garden", recipe: styleRecipe("pride") },
    ];
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Edit Night garden" }));
    await user.clear(screen.getByLabelText("Custom design name"));
    await user.type(screen.getByLabelText("Custom design name"), "Night sky");
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      designs: [{ id: designId, name: "Night sky" }],
      assignments: profile.assignments,
    });
  });

  it("detaches the first preset edit into a validated custom design", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 2, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await selectStartFromStyle(user, "pride");
    await user.click(materialTile("Glass"));
    expect(screen.getByText("Based on Pride")).toBeDefined();
    await user.clear(screen.getByLabelText("Custom design name"));
    await user.type(screen.getByLabelText("Custom design name"), "Night garden");
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const saved = onSave.mock.calls[0]?.[0] as AppearanceProfileV4;
    expect(saved.designs[0]).toMatchObject({ id: designId, name: "Night garden" });
    expect(saved.assignments.all).toEqual({ source: "custom", id: designId });
  });

  it("edits an assigned saved design in place and shows its affected targets", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const profile = personalProfile();
    profile.designs = [
      { id: designId, name: "Shared garden", recipe: styleRecipe("pride") },
    ];
    profile.assignments = {
      all: { source: "custom", id: designId },
      overrides: {},
    };
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(materialTile("Glass"));

    expect(screen.getByText("Changes to Shared garden affect: All dice.")).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].designs[0]?.id).toBe(designId);
  });

  it("reports optimistic revision conflicts without claiming a save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.reject(
      new AppearanceApiError("appearance_revision_conflict", 409),
    ));
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await selectStartFromStyle(user, "dice-witch");
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    expect(await screen.findByText(
      "This appearance changed elsewhere. Reloaded settings are required before saving again.",
    )).toBeDefined();
  });

  it("keeps the original revision when a remote update overlaps a local draft", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const props: AppearanceEditorV3Props = {
      catalog: APPEARANCE_CATALOG_V3,
      resource: {
        revision: 4,
        profile: personalProfile(),
        canRestorePreviousMix: false,
      },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
      onReset: resetTestProfile,
      onRestore: restoreTestProfile,
    };
    const view = render(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3View PreviewPane={TestPreviewPane} {...props} />
      </QueryClientProvider>,
    );

    await selectStartFromStyle(user, "dice-witch");
    const remoteProfile = personalProfile();
    remoteProfile.assignments.all = { source: "builtin", id: "pride" };
    view.rerender(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3View
          PreviewPane={TestPreviewPane}
          {...props}
          resource={{
            revision: 5,
            profile: remoteProfile,
            canRestorePreviousMix: false,
          }}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByText(
        "This appearance changed elsewhere. Cancel to load the newer settings before saving again.",
      ),
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[1]).toBe(4);
  });

  it("accepts a remote Design update after a name is restored", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const profile = personalProfile();
    profile.designs = [
      { id: designId, name: "Night garden", recipe: styleRecipe("pride") },
    ];
    profile.assignments.all = { source: "custom", id: designId };
    const props: AppearanceEditorV3Props = {
      catalog: APPEARANCE_CATALOG_V3,
      resource: {
        revision: 4,
        profile,
        canRestorePreviousMix: false,
      },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
      onReset: resetTestProfile,
      onRestore: restoreTestProfile,
    };
    const view = render(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3View PreviewPane={TestPreviewPane} {...props} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Edit Night garden" }));
    const name = screen.getByLabelText("Custom design name");
    await user.clear(name);
    await user.type(name, "Temporary name");
    await user.clear(name);
    await user.type(name, "Night garden");
    const remoteProfile = structuredClone(profile);
    remoteProfile.assignments.all = { source: "builtin", id: "dice-witch" };
    view.rerender(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3View
          PreviewPane={TestPreviewPane}
          {...props}
          resource={{
            revision: 5,
            profile: remoteProfile,
            canRestorePreviousMix: false,
          }}
        />
      </QueryClientProvider>,
    );

    expect(startFromCard("dice-witch").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      screen.queryByText(/This appearance changed elsewhere/),
    ).toBeNull();
  });

  it("merges an independent server-mode update into a Design draft", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const profile: GuildAppearanceProfileV4 = {
      ...personalProfile(),
      mode: "default",
      designs: [],
      assignments: { all: null, overrides: {} },
    };
    const props: AppearanceEditorV3Props = {
      catalog: APPEARANCE_CATALOG_V3,
      resource: {
        revision: 4,
        profile,
        canRestorePreviousMix: false,
      },
      kind: "guild",
      personalDesigns: [],
      isSaving: false,
      onSave,
      onReset: resetTestProfile,
      onRestore: restoreTestProfile,
    };
    const view = render(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3View PreviewPane={TestPreviewPane} {...props} />
      </QueryClientProvider>,
    );

    await selectStartFromStyle(user, "dice-witch");
    view.rerender(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3View
          PreviewPane={TestPreviewPane}
          {...props}
          resource={{
            revision: 5,
            profile: { ...profile, mode: "enforced" },
            canRestorePreviousMix: false,
          }}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      mode: "enforced",
      assignments: { all: { source: "builtin", id: "dice-witch" } },
    });
    expect(onSave.mock.calls[0]?.[1]).toBe(5);
  });

  it("copies a personal design into an independent guild draft", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const personalDesign: CustomAppearanceDesignV3 = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Personal glass",
      recipe: styleRecipe("glass-cannon"),
    };
    const guild: GuildAppearanceProfileV4 = {
      ...personalProfile(),
      mode: "default",
      designs: [],
      assignments: { all: null, overrides: {} },
    };
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 1, profile: guild },
      kind: "guild",
      personalDesigns: [personalDesign],
      isSaving: false,
      onSave,
    });

    await user.selectOptions(
      screen.getByLabelText("Personal design to copy"),
      personalDesign.id,
    );
    await user.click(screen.getByRole("button", { name: "Copy to draft" }));
    await selectStartFromStyle(user, "dice-witch");
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const copied = onSave.mock.calls[0]?.[0] as GuildAppearanceProfileV4;
    expect(copied.mode).toBe("default");
    expect(copied.assignments.all).toEqual({
      source: "builtin",
      id: "dice-witch",
    });
    expect(copied.designs[0]?.recipe).toEqual({
      ...personalDesign.recipe,
      form: {
        ...personalDesign.recipe.form,
        policy: "material-default-v1",
      },
    });
    expect(copied.designs[0]?.recipe).not.toBe(personalDesign.recipe);
  });

  it("duplicates an assigned design instead of renaming the original", async () => {
    const user = userEvent.setup();
    const copyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(copyId);
    const onSave = vi.fn(async () => undefined);
    const profile = personalProfile();
    profile.designs = [
      { id: designId, name: "Night garden", recipe: styleRecipe("pride") },
    ];
    profile.assignments = {
      all: { source: "custom", id: designId },
      overrides: {},
    };
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Edit Night garden" }));
    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Night garden",
    );
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Night garden copy",
    );

    await user.clear(screen.getByLabelText("Custom design name"));
    await user.type(screen.getByLabelText("Custom design name"), "Night sky");
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const saved = onSave.mock.calls[0]?.[0] as AppearanceProfileV4;
    expect(saved.designs).toHaveLength(2);
    expect(saved.designs[0]).toMatchObject({
      id: designId,
      name: "Night garden",
    });
    expect(saved.designs[1]).toMatchObject({ id: copyId, name: "Night sky" });
    expect(saved.assignments.all).toEqual({ source: "custom", id: designId });
  });

  it("creates a named design from a preset without editing a control", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    expect(screen.queryByLabelText("Custom design name")).toBeNull();
    await user.click(screen.getByRole("button", { name: "New design" }));

    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Random edit",
    );
    expect(screen.getByText("Based on Random")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const saved = onSave.mock.calls[0]?.[0] as AppearanceProfileV4;
    expect(saved.designs).toHaveLength(1);
    expect(saved.designs[0]).toMatchObject({
      id: designId,
      name: "Random edit",
    });
    expect(saved.assignments.all).toEqual({ source: "custom", id: designId });
  });

  it("keeps an explicitly created design when another preset is chosen", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    await user.click(screen.getByRole("button", { name: "New design" }));
    await selectStartFromStyle(user, "dice-witch");

    expect(confirm).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Edit Random edit" }),
    ).toBeDefined();
  });

  it("stops creating designs at the ten-design cap", async () => {
    const user = userEvent.setup();
    const profile = personalProfile();
    profile.designs = Array.from({ length: 10 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
      name: `Design ${index + 1}`,
      recipe: styleRecipe("pride"),
    }));
    profile.assignments = {
      all: { source: "custom", id: profile.designs[0]?.id ?? designId },
      overrides: {},
    };
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    expect(
      screen.getByRole("button", { name: "Duplicate Design 1" }),
    ).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Edit Design 1" }));
    expect(screen.getByRole("button", { name: "Duplicate" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

describe("AppearanceEditorV3 chip actions", () => {
  it("discards a saved die design via the chip menu while keeping it listed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSave = vi.fn(async () => undefined);
    const profile = personalProfile();
    profile.designs = [
      { id: designId, name: "Night garden", recipe: styleRecipe("pride") },
    ];
    profile.assignments = {
      all: null,
      overrides: { d20: { source: "custom", id: designId } },
    };
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    fireEvent.contextMenu(screen.getByRole("radio", { name: "d20" }));
    await user.click(
      screen.getByRole("menuitem", { name: /Discard d20's design/ }),
    );
    expect(window.confirm).toHaveBeenCalledWith("Discard d20's design?");

    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].assignments).toEqual({
      all: null,
      overrides: {},
    });
    // The saved design stays in the rail.
    expect(screen.getByText("Night garden")).toBeDefined();
  });

  it("stages deletion of an unassigned unsaved draft when its only override is discarded", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await selectAppearanceTarget(user, "d20");
    await selectStartFromStyle(user, "pride");
    await user.click(materialTile("Glass"));
    fireEvent.contextMenu(screen.getByRole("radio", { name: "d20" }));
    await user.click(
      screen.getByRole("menuitem", { name: /Discard d20's design/ }),
    );
    expect(window.confirm).toHaveBeenCalledWith("Discard d20's design?");
    expect(
      screen.getByText(/Deleting Pride edit is staged/),
    ).toBeDefined();
    // d20 falls back to following ALL.
    expect(
      screen.getByText(/Your first change gives d20 its own copy/),
    ).toBeDefined();
  });

  it("saves Matched Set as a fresh roll-scoped draw", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Matched set" }));
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());

    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.assignments.all).toEqual({
      source: "custom",
      id: designId,
    });
    expect(saved.designs).toEqual([
      expect.objectContaining({
        id: designId,
        recipe: expect.objectContaining({
          variation: "curated",
          varyBy: "roll",
        }),
      }),
    ]);
  });

  it("immediately resets ALL and every per-die override without confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    const profile = personalProfile();
    profile.designs = [
      { id: designId, name: "Shared design", recipe: styleRecipe("pride") },
    ];
    profile.assignments = {
      all: { source: "custom", id: designId },
      overrides: { d6: { source: "custom", id: designId } },
    };
    const onReset = vi.fn(async (current: AppearanceProfileV4, revision: number) => ({
      revision: revision + 1,
      profile: {
        ...current,
        assignments: { all: null, overrides: {} },
      },
      canRestorePreviousMix: true,
    }));
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
      onReset,
    });

    const reset = screen.getByRole("button", { name: "Reset to default" });
    expect(reset.textContent).toContain("Reset default");
    await user.click(reset);
    await waitFor(() => expect(onReset).toHaveBeenCalledWith(profile, 4));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save & apply" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reset to default" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText("Dice mix reset to default.")).toBeDefined();
  });

  it("restores the durable previous mix without confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    const current = personalProfile();
    current.assignments = { all: null, overrides: {} };
    const previous = personalProfile();
    const onRestore = vi.fn(async () => ({
      revision: 5,
      profile: previous,
      canRestorePreviousMix: true,
    }));
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: {
        revision: 4,
        profile: current,
        canRestorePreviousMix: true,
      },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
      onRestore,
    });

    const restore = screen.getByRole("button", {
      name: "Restore previous mix",
    });
    expect(restore.textContent).toContain("Restore prev.");
    await user.click(restore);
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(current, 4));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText("Previous dice mix restored.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save & apply" })).toBeNull();
  });

  it("returns to the default mix while a custom design is active", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    await selectStartFromStyle(user, "pride");
    await user.click(materialTile("Glass"));
    expect(screen.getByLabelText("Custom design name")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Reset to default" }));

    expect(startFromCard("chaotic").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
  });
});
