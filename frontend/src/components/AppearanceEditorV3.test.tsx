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
import { getAppearancePreviewV4 } from "@/lib/appearance-v3";
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

async function selectAppearanceTarget(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> {
  await user.click(screen.getByRole("radio", { name }));
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

    await selectAppearanceTarget(user, "d20");
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
    expect(screen.queryByRole("region", { name: "Dice view" })).toBeNull();

    await user.click(cameraTab);
    expect(cameraTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: "Dice view" })).toBeDefined();
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

  it("keeps the picker target authoritative while Camera controls change", async () => {
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
      expect(vi.mocked(getAppearancePreviewV4)).toHaveBeenLastCalledWith(
        expect.objectContaining({ target: "d8" }),
      ),
    );
    await user.click(screen.getByLabelText("Use legacy dice view"));
    expect(d8.getAttribute("aria-checked")).toBe("true");
    await waitFor(() =>
      expect(vi.mocked(getAppearancePreviewV4)).toHaveBeenLastCalledWith(
        expect.objectContaining({ target: "d8" }),
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

  it("keeps controls open and detaches a preset only after a meaningful edit", async () => {
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
    expect(screen.getByRole("group", { name: "Colors" })).toBeDefined();
    expect(screen.queryByRole("tab", { name: /Design, unsaved/ })).toBeNull();

    await user.selectOptions(screen.getByRole("combobox", { name: "Preset" }), "pride");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Custom design name")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Choose color 1" }));
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#123456");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("Based on Pride")).toBeDefined();
    expect(screen.getByLabelText("Custom design name")).toHaveProperty("value", "Edit 1");
    expect(screen.getByRole("tab", { name: "Design, unsaved changes" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Preset" })).toHaveProperty("value", "chaotic");
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
      version: 4,
      onSave,
    });

    await user.click(screen.getByRole("tab", { name: "Camera" }));
    await user.click(screen.getByLabelText("Keep rolled results clear"));
    await user.click(screen.getByRole("tab", { name: "Design" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Preset" }), "dice-witch");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved changes: Design and Camera.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      version: 4,
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
      version: 4,
      onSave,
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Preset" }), "pride");
    await user.click(screen.getByRole("button", { name: "Choose color 1" }));
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#123456");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.clear(screen.getByLabelText("Custom design name"));
    await user.type(screen.getByLabelText("Custom design name"), "Combined draft");

    await user.click(screen.getByRole("tab", { name: "Camera" }));
    await user.click(screen.getByLabelText("Keep rolled results clear"));
    expect(screen.getByText("Unsaved changes: Design and Camera.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      version: 4,
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

    const preset = screen.getByRole("combobox", { name: "Preset" });
    await user.selectOptions(preset, "dice-witch");
    expect(onSave).not.toHaveBeenCalled();
    await user.selectOptions(preset, "chaotic");
    expect(screen.queryByRole("button", { name: "Save & apply" })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("confirms before replacing an unsaved custom design draft", async () => {
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

    const preset = screen.getByRole("combobox", { name: "Preset" });
    await user.selectOptions(preset, "pride");
    await user.click(screen.getByRole("button", { name: "Choose color 1" }));
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#123456");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.selectOptions(preset, "dice-witch");

    expect(confirm).toHaveBeenCalledWith(
      "Discard the unsaved custom design Edit 1?",
    );
    expect(screen.getByLabelText("Custom design name")).toHaveProperty(
      "value",
      "Edit 1",
    );

    confirm.mockReturnValue(true);
    await user.selectOptions(preset, "dice-witch");
    expect(screen.queryByLabelText("Custom design name")).toBeNull();
    expect(preset).toHaveProperty("value", "dice-witch");
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
    await user.selectOptions(screen.getByRole("combobox", { name: "Preset" }), "pride");
    await selectAppearanceTarget(user, "All dice");
    await user.selectOptions(screen.getByRole("combobox", { name: "Preset" }), "dice-witch");
    await selectAppearanceTarget(user, "d20");
    expect(screen.getByRole("combobox", { name: "Preset" })).toHaveProperty("value", "pride");
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].assignments).toEqual({
      all: { source: "builtin", id: "dice-witch" },
      overrides: { d20: { source: "builtin", id: "pride" } },
    });
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
    await user.selectOptions(screen.getByRole("combobox", { name: "Preset" }), "pride");
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].assignments).toEqual({
      all: { source: "builtin", id: "chaotic" },
      overrides: { d20: { source: "builtin", id: "pride" } },
    });
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
    expect(screen.getByLabelText("Custom design name")).toHaveProperty("value", "Night garden");
    await user.click(screen.getByRole("button", { name: "Delete Night garden" }));
    expect(screen.queryByText("Night garden")).toBeNull();
    expect(screen.getByText(/Deleting Night garden returns All dice/)).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Night garden")).toBeDefined();
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

    await user.selectOptions(screen.getByRole("combobox", { name: "Preset" }), "pride");
    await user.click(screen.getByRole("button", { name: "Choose color 1" }));
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#123456");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("Based on Pride")).toBeDefined();
    await user.clear(screen.getByLabelText("Custom design name"));
    await user.type(screen.getByLabelText("Custom design name"), "Night garden");
    await user.click(screen.getByRole("button", { name: "Save & apply" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]?.[0] as AppearanceProfileV3;
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

    await user.click(screen.getByRole("button", { name: "Choose color 1" }));
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#123456");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("Changes to Shared garden affect: All dice.")).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].designs[0]?.id).toBe(designId);
  });

  it("reports optimistic revision conflicts without claiming a save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.reject(new AppearanceApiError(
      "appearance_revision_conflict", 409, "appearance_revision_conflict",
    )));
    renderEditor({
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Preset" }), "dice-witch");
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
    const props: React.ComponentProps<typeof AppearanceEditorV3> = {
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile: personalProfile() },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave,
    };
    const view = render(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3 {...props} />
      </QueryClientProvider>,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preset" }),
      "dice-witch",
    );
    const remoteProfile = personalProfile();
    remoteProfile.assignments.all = { source: "builtin", id: "pride" };
    view.rerender(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3
          {...props}
          resource={{ revision: 5, profile: remoteProfile }}
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
    const props: React.ComponentProps<typeof AppearanceEditorV3> = {
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "personal",
      personalDesigns: [],
      isSaving: false,
      onSave: vi.fn(async () => undefined),
    };
    const view = render(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3 {...props} />
      </QueryClientProvider>,
    );

    const name = screen.getByLabelText("Custom design name");
    await user.clear(name);
    await user.type(name, "Temporary name");
    await user.clear(name);
    await user.type(name, "Night garden");
    const remoteProfile = structuredClone(profile);
    remoteProfile.assignments.all = { source: "builtin", id: "dice-witch" };
    view.rerender(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3
          {...props}
          resource={{ revision: 5, profile: remoteProfile }}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("combobox", { name: "Preset" })).toHaveProperty(
      "value",
      "dice-witch",
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
    const profile: GuildAppearanceProfileV3 = {
      version: 3,
      mode: "default",
      designs: [],
      assignments: { all: null, overrides: {} },
    };
    const props: React.ComponentProps<typeof AppearanceEditorV3> = {
      catalog: APPEARANCE_CATALOG_V3,
      resource: { revision: 4, profile },
      kind: "guild",
      personalDesigns: [],
      isSaving: false,
      onSave,
    };
    const view = render(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3 {...props} />
      </QueryClientProvider>,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preset" }),
      "dice-witch",
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <AppearanceEditorV3
          {...props}
          resource={{ revision: 5, profile: { ...profile, mode: "enforced" } }}
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
