import { CustomColorPickerDialog } from "@/components/CustomColorPickerDialog";
import {
  createRandomAppearanceColorsV3,
  selectionValuesV3,
} from "@/lib/appearance-editor-v3";
import { applyColorScheme } from "@/lib/mix-picker-state";
import type {
  AppearanceCatalogV3,
  AppearanceRecipeV3,
} from "@/types/appearance";
import {
  materialColorEffectV4,
  type AppearanceColorsV3,
  type AppearanceMaterialV4,
  type HexColor,
} from "@dice-witch/dice-v4-model";
import { Dices, Plus, X } from "lucide-react";
import * as React from "react";

type EditingColor =
  | { kind: "palette"; index: number }
  | { kind: "primary" };

type MixPickerColorsRowProps = {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  disabled?: boolean;
  onChange(recipe: AppearanceRecipeV3, sourceName?: string): void;
};

function usesFullSpectrumRandomization(recipe: AppearanceRecipeV3): boolean {
  return (
    recipe.randomization === "full-spectrum-v1" ||
    recipe.randomization === "full-spectrum-v2"
  );
}

function usesSelectedColors(material: AppearanceMaterialV4): boolean {
  return (
    material.family === "hollow-metal" ||
    materialColorEffectV4(material) !== "adds-own-colors"
  );
}

function colorSchemeBackground(colors: AppearanceColorsV3): string {
  if (colors.mode === "solid" || colors.mode === "tonal" || colors.mode === "random") {
    return colors.primary;
  }
  if (colors.mode === "palette") {
    const step = 100 / colors.colors.length;
    return `linear-gradient(90deg, ${colors.colors
      .map(
        (color, index) =>
          `${color} ${String(index * step)}% ${String((index + 1) * step)}%`,
      )
      .join(", ")})`;
  }
  return "linear-gradient(90deg, #ff3b30, #ffd60a, #34c759, #0a84ff, #af52de)";
}

function materialName(
  catalog: AppearanceCatalogV3,
  family: string,
): string {
  return (
    catalog.materials.find(({ family: candidate }) => candidate === family)
      ?.name ?? family
  );
}

export function MixPickerColorsRow({
  recipe,
  catalog,
  disabled = false,
  onChange,
}: MixPickerColorsRowProps) {
  const [editingColor, setEditingColor] = React.useState<EditingColor | null>(
    null,
  );
  const colorSchemes = catalog.colorSchemeStyleIds.map((styleId) => {
    const style = catalog.styles.find(({ id }) => id === styleId);
    if (style === undefined) {
      throw new Error(`Appearance color scheme is missing: ${styleId}`);
    }
    return style;
  });
  const values = selectionValuesV3(recipe.material);
  const bringsOwn = values.filter((material) => !usesSelectedColors(material));
  const responds = values.filter(usesSelectedColors);
  const ownNames = [...new Set(
    bringsOwn.map((material) => materialName(catalog, material.family)),
  )];
  const respondNames = [...new Set(
    responds.map((material) => materialName(catalog, material.family)),
  )];

  const emit = (nextColors: AppearanceColorsV3) => {
    const updated: AppearanceRecipeV3 = { ...recipe, colors: nextColors };
    // Stale randomization policies must never survive an explicit color pick.
    if (
      usesFullSpectrumRandomization(recipe) ||
      (recipe.randomization === "one-palette-color-v1" &&
        nextColors.mode !== "palette")
    ) {
      delete updated.randomization;
    }
    if (
      updated.colorDistribution === "one-per-die" &&
      nextColors.mode !== "palette"
    ) {
      delete updated.colorDistribution;
    }
    onChange(updated);
  };

  let caption: string | null = null;
  if (bringsOwn.length > 0 && responds.length === 0) {
    caption = `${ownNames.join(" + ")} ${
      ownNames.length === 1 ? "adds" : "add"
    } its own accents`;
  } else if (bringsOwn.length > 0) {
    caption = `Applies to ${respondNames.join(" + ")} — ${ownNames.join(" + ")} ${
      ownNames.length === 1 ? "adds" : "add"
    } its own accents`;
  }

  const colors = recipe.colors;
  const addPaletteColor = (primary: HexColor) => {
    const additionalColor = catalog.editorDefaults.palette.find(
      (color) => color !== primary,
    );
    if (additionalColor === undefined) {
      throw new Error("Appearance catalog needs a second palette color");
    }
    setEditingColor({ kind: "palette", index: 1 });
    emit({ mode: "palette", colors: [primary, additionalColor] });
  };

  const removePaletteColor = (index: number) => {
    if (colors.mode !== "palette") return;
    const remaining = colors.colors.filter(
      (_, position) => position !== index,
    );
    const primary = remaining[0];
    if (remaining.length === 1 && primary !== undefined) {
      emit({ mode: "solid", primary });
      return;
    }
    emit({ mode: "palette", colors: remaining });
  };

  let editor: React.ReactNode;
  if (colors.mode === "random") {
    editor = (
      <p className="text-xs text-muted-foreground">
        A new color is drawn every roll.
      </p>
    );
  } else if (colors.mode === "palette") {
    editor = (
      <div className="flex flex-wrap items-center gap-2">
        {colors.colors.map((color, index) => (
          <span key={`${color}-${index}`} className="relative">
            <button
              type="button"
              aria-label={`Palette color ${index + 1}`}
              disabled={disabled}
              onClick={() => setEditingColor({ kind: "palette", index })}
              className="block h-9 w-9 rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              style={{ backgroundColor: color }}
            />
            {colors.colors.length > 1 && !disabled && (
              <button
                type="button"
                aria-label={`Remove palette color ${index + 1}`}
                onClick={() => removePaletteColor(index)}
                className="absolute -right-1 -top-1 z-10 grid h-5 w-5 place-items-center rounded-full border bg-background text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {colors.colors.length < 6 && !disabled && (
          <button
            type="button"
            aria-label="Add palette color"
            onClick={() => {
              const unused =
                catalog.editorDefaults.palette.find(
                  (candidate) => !colors.colors.includes(candidate),
                ) ?? "#888888";
              emit({ mode: "palette", colors: [...colors.colors, unused] });
            }}
            className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-muted-foreground/60 text-muted-foreground hover:border-brand hover:text-brand"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  } else {
    const primary =
      colors.mode === "solid" || colors.mode === "tonal"
        ? colors.primary
        : catalog.editorDefaults.primaryColor;
    const editPrimary = () => {
      setEditingColor({ kind: "primary" });
      if (colors.mode !== "solid" && colors.mode !== "tonal") {
        emit({ mode: "solid", primary });
      }
    };
    editor = (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Dice color"
          disabled={disabled}
          onClick={editPrimary}
          className="block h-9 w-9 rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          style={{ backgroundColor: primary }}
        />
        <button
          type="button"
          aria-label="Add palette color"
          disabled={disabled}
          onClick={() => addPaletteColor(primary)}
          className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-muted-foreground/60 text-muted-foreground hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <div role="group" aria-label="Color treatment" className="flex gap-1">
          {(["solid", "tonal"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={colors.mode === mode}
              disabled={disabled}
              onClick={() => emit({ mode, primary })}
              className={`rounded-md border px-2 py-1 text-xs font-medium capitalize ${
                colors.mode === mode
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    );
  }

  let pickerColor: string | undefined;
  if (editingColor?.kind === "palette" && colors.mode === "palette") {
    pickerColor = colors.colors[editingColor.index];
  } else if (
    editingColor?.kind === "primary" &&
    (colors.mode === "solid" || colors.mode === "tonal")
  ) {
    pickerColor = colors.primary;
  }

  const applyPickerColor = (color: string) => {
    const normalized = color.toLowerCase();
    if (editingColor?.kind === "palette" && colors.mode === "palette") {
      const next = [...colors.colors];
      next[editingColor.index] = normalized;
      emit({ mode: "palette", colors: next });
    } else if (
      editingColor?.kind === "primary" &&
      (colors.mode === "solid" || colors.mode === "tonal")
    ) {
      emit({ ...colors, primary: normalized });
    }
  };

  return (
    <>
      <section aria-label="Colors">
        <header className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Colors
          </h3>
          <button
            type="button"
            disabled={disabled}
            onClick={() => emit(createRandomAppearanceColorsV3())}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Dices className="h-3.5 w-3.5" aria-hidden="true" />
            Random
          </button>
        </header>
        <div
          role="group"
          aria-label="Color schemes"
          className="mt-2 flex flex-wrap gap-2"
        >
          {colorSchemes.map((style) => {
            const distribution =
              style.recipe.colorDistribution === "one-per-die" ||
              style.recipe.randomization === "one-palette-color-v1"
                ? "one-per-die"
                : "coordinated";
            const selected =
              JSON.stringify(recipe.colors) === JSON.stringify(style.recipe.colors) &&
              (recipe.colorDistribution === distribution ||
                (recipe.colorDistribution === undefined &&
                  ((distribution === "one-per-die" &&
                    recipe.randomization === "one-palette-color-v1") ||
                    distribution === "coordinated")));
            return (
              <button
                key={style.id}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => {
                  if (selected) return;
                  onChange(
                    applyColorScheme(
                      recipe,
                      style.recipe.colors,
                      distribution,
                    ),
                    style.name,
                  );
                }}
                className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                  selected
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-5 rounded-full border border-black/15"
                  style={{
                    background: colorSchemeBackground(style.recipe.colors),
                  }}
                />
                {style.name}
              </button>
            );
          })}
        </div>
        {caption !== null && (
          <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
        )}
        <div className="mt-2">{editor}</div>
      </section>
      {pickerColor !== undefined && (
        <CustomColorPickerDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditingColor(null);
          }}
          value={pickerColor}
          onChange={applyPickerColor}
          title={
            editingColor?.kind === "palette"
              ? `Palette color ${editingColor.index + 1}`
              : "Dice color"
          }
          description="Choose a dice color."
          visuallyHideHeader
          suggestedColors={catalog.editorDefaults.palette}
        />
      )}
    </>
  );
}
