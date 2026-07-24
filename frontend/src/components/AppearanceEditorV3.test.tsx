// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import type {
  AppearanceProfileV3,
  CustomAppearanceDesignV3,
  GuildAppearanceProfileV3,
} from "@dice-witch/dice-v4-model";
import { AppearanceApiError } from "@/lib/appearance";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    expect(screen.queryByLabelText("Design name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Randomize" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply to/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Customize" }));
    expect(screen.getByLabelText("Design name")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save & apply" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Design name")).toBeNull();
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

  it("applies one preset to all dice and clears target overrides", async () => {
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
      screen.getByRole("combobox", { name: "Preset" }),
      "dice-witch",
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].assignments).toEqual({
      all: { source: "builtin", id: "dice-witch" },
      overrides: {},
    });
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
    expect(screen.queryByLabelText("Design name")).toBeNull();
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
    const firstColor = screen.getByLabelText("Color 1");
    fireEvent.change(firstColor, { target: { value: "#123456" } });
    expect(screen.getByLabelText("Design name")).toHaveProperty(
      "value",
      "Edit 1",
    );
    await user.clear(screen.getByLabelText("Design name"));
    await user.type(screen.getByLabelText("Design name"), "Night garden");
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
