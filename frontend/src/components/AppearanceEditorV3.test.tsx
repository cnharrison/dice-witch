// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import {
  createDefaultDiceViewPreferencesV4,
  type AppearanceProfileV3,
  type AppearanceProfileV4,
  type CustomAppearanceDesignV3,
  GuildAppearanceProfileV3,
} from "@dice-witch/dice-v4-model";
import { AppearanceApiError } from "@/lib/appearance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceEditorV3 } from "./AppearanceEditorV3";

vi.mock("@/lib/appearance-v3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appearance-v3")>();
  return {
    ...actual,
    getAppearancePreviewV3: vi.fn(async () => ({
      version: 3,
      contentType: "image/png",
      width: 150,
      height: 150,
      base64: "iVBORw0KGgo=",
    })),
    getAppearancePreviewV4: vi.fn(async () => ({
      version: 4,
      contentType: "image/png",
      width: 150,
      height: 150,
      base64: "iVBORw0KGgo=",
    })),
  };
});

const designId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function personalProfile(): AppearanceProfileV3 {
  return {
    version: 3,
    designs: [],
    assignments: {
      all: { source: "builtin", id: "chaotic" },
      overrides: { d20: { source: "builtin", id: "hex-appeal" } },
    },
  };
}

function personalProfileV4(): AppearanceProfileV4 {
  const profile = personalProfile();
  return {
    ...profile,
    version: 4,
    diceView: createDefaultDiceViewPreferencesV4(),
  };
}

function styleRecipe(styleId: string) {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return structuredClone(style.recipe);
}

function renderEditor(
  props: React.ComponentProps<typeof AppearanceEditorV3>,
): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <AppearanceEditorV3 {...props} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppearanceEditorV3", () => {
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

    const preview = screen.getByRole("region", { name: "Preview" });
    const editor = preview.closest("section.grid");
    expect(editor?.className).toContain("xl:grid-cols");
    expect(preview.parentElement?.className).toContain("xl:sticky");
    expect(screen.queryByRole("heading", { name: "Saved designs" })).toBeNull();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Appearance target" }),
      "d20",
    );
    expect(editor?.className).toContain("xl:grid-cols");
    expect(preview.parentElement?.className).toContain("xl:sticky");
  });

  it("keeps one preview mounted while switching between Design and Camera tabs", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfileV4() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      version: 4,
      onSave: vi.fn(async () => undefined),
    });

    const preview = screen.getByRole("region", { name: "Preview" });
    const designTab = screen.getByRole("tab", { name: "Design" });
    const cameraTab = screen.getByRole("tab", { name: "Camera" });
    expect(designTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Preset" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Dice view" })).toBeNull();

    await user.click(cameraTab);
    expect(cameraTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Dice view" })).toBeDefined();
    expect(screen.queryByRole("combobox", { name: "Preset" })).toBeNull();
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

  it("keeps the mobile preview available as one collapsible panel", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfileV4() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      version: 4,
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

  it("keeps detailed controls transactional and removes redundant preset actions", async () => {
    const user = userEvent.setup();
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    });

    expect(screen.queryByLabelText("Custom design name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Randomize" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply to/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Customize" }));
    expect(screen.getByLabelText("Custom design name")).toBeDefined();
    expect(
      screen.getByRole("tab", { name: "Design, unsaved changes" }),
    ).toBeDefined();
    expect(screen.getByText("Unsaved changes: Design.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save & apply" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
  });

  it("keeps V4 camera changes in the shared Save & apply draft", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfileV4() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      version: 4,
      onSave,
    });

    await user.click(screen.getByRole("tab", { name: "Camera" }));
    await user.click(screen.getByLabelText("Keep rolled results clear"));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByRole("tab", { name: "Camera, unsaved changes" }),
    ).toBeDefined();
    expect(screen.getByText("Unsaved changes: Camera.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save & apply" })).toBeDefined();

    await user.click(screen.getByRole("tab", { name: "Design" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preset" }),
      "dice-witch",
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      version: 4,
      diceView: { mode: "normal" },
    });

    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]?.[0]).toMatchObject({
      version: 4,
      diceView: { mode: "clear" },
    });
  });

  it("preserves appearance and camera drafts through one save", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const onSave = vi.fn(async () => undefined);
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfileV4() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      version: 4,
      onSave,
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preset" }),
      "pride",
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "Choose color 1" }));
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#123456");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.clear(screen.getByLabelText("Custom design name"));
    await user.type(
      screen.getByLabelText("Custom design name"),
      "Combined draft",
    );

    await user.click(screen.getByRole("tab", { name: "Camera" }));
    await user.click(screen.getByLabelText("Keep rolled results clear"));
    expect(
      screen.queryByRole("textbox", { name: "Custom design name" }),
    ).toBeNull();
    expect(screen.getByText("Unsaved changes: Design and Camera.")).toBeDefined();
    expect(
      screen.getByRole("tab", { name: "Design, unsaved changes" }),
    ).toBeDefined();
    expect(
      screen.getByRole("tab", { name: "Camera, unsaved changes" }),
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const saved = onSave.mock.calls[1]?.[0];
    expect(saved).toMatchObject({
      version: 4,
      diceView: { mode: "clear" },
      designs: [{ id: designId, name: "Combined draft" }],
    });
    const colors = saved?.designs[0]?.recipe.colors;
    if (colors?.mode !== "palette") {
      throw new Error("Combined draft palette is missing");
    }
    expect(colors.colors[0]).toBe("#123456");
  });

  it("applies Random directly from the preset selector", async () => {
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
    const preset = screen.getByRole("combobox", { name: "Preset" });

    await user.selectOptions(preset, "dice-witch");
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await user.selectOptions(preset, "chaotic");
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    expect(onSave.mock.calls[1]?.[0].assignments).toEqual({
      all: { source: "builtin", id: "chaotic" },
      overrides: {},
    });
  });

  it("shows branded progress and a check while applying a preset", async () => {
    const user = userEvent.setup();
    let completeSave: (() => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeSave = resolve;
        }),
    );
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preset" }),
      "dice-witch",
    );

    expect(screen.getByRole("status").textContent).toBe("Applying preset");
    expect(
      screen.getByRole("status").querySelector('[data-loading-glyph="sparkles"]'),
    ).toBeTruthy();
    expect(onSave.mock.calls[0]?.[0].assignments).toEqual({
      all: { source: "builtin", id: "dice-witch" },
      overrides: {},
    });

    completeSave?.();
    await waitFor(() =>
      expect(
        screen.getByRole("status").querySelector('[data-completion-glyph="check"]'),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("status").textContent).toBe("Preset applied");
    expect(
      screen.queryByText("All dice now uses the selected preset."),
    ).toBeNull();
  });

  it("applies a target preset without changing the All dice assignment", async () => {
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

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Appearance target" }),
      "d20",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preset" }),
      "pride",
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].assignments).toEqual({
      all: { source: "builtin", id: "chaotic" },
      overrides: { d20: { source: "builtin", id: "pride" } },
    });
  });

  it("assigns an existing saved design immediately without opening Customize", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const profile = personalProfile();
    profile.designs = [
      {
        id: designId,
        name: "Night garden",
        recipe: styleRecipe("pride"),
      },
    ];
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: "Use Night garden" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].assignments).toEqual({
      all: { source: "custom", id: designId },
      overrides: {},
    });
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
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

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preset" }),
      "pride",
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "Choose color 1" }));
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#123456");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Edit 1",
    );
    await user.clear(screen.getByLabelText("Custom design name"));
    await user.type(
      screen.getByLabelText("Custom design name"),
      "Night garden",
    );
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const saved = onSave.mock.calls[1]?.[0] as AppearanceProfileV3;
    expect(saved.designs).toHaveLength(1);
    expect(saved.designs[0]).toMatchObject({
      id: designId,
      name: "Night garden",
      recipe: { version: 3, variation: "fixed" },
    });
    expect(saved.assignments.all).toEqual({ source: "custom", id: designId });
  });

  it("reports optimistic revision conflicts without claiming a save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() =>
      Promise.reject(
        new AppearanceApiError(
          "appearance_revision_conflict",
          409,
          "appearance_revision_conflict",
        ),
      ),
    );
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preset" }),
      "dice-witch",
    );
    expect(
      await screen.findByText(
        "This appearance changed elsewhere. Reloaded settings are required before saving again.",
      ),
    ).toBeDefined();
  });

  it("copies a personal design into an independent guild draft", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(designId);
    const personalDesign: CustomAppearanceDesignV3 = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Personal glass",
      recipe: styleRecipe("glass-cannon"),
    };
    const guild: GuildAppearanceProfileV3 = {
      version: 3,
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
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const copied = onSave.mock.calls[0]?.[0] as GuildAppearanceProfileV3;
    expect(copied.mode).toBe("default");
    expect(copied.designs[0]?.recipe).toEqual({
      ...personalDesign.recipe,
      form: {
        ...personalDesign.recipe.form,
        policy: "material-default-v1",
      },
    });
    expect(copied.designs[0]?.recipe).not.toBe(personalDesign.recipe);
  });
});
