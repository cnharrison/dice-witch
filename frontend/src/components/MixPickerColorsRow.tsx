import { selectionValuesV3 } from "@/lib/appearance-editor-v3";
import {
  curatedPalettePool,
  surpriseColors,
} from "@/lib/mix-picker-state";
import type {
  AppearanceCatalogV3,
  AppearanceRecipeV3,
} from "@/types/appearance";
import {
  materialColorEffectV4,
  type AppearanceColorsV3,
} from "@dice-witch/dice-v4-model";
import { Dices, Plus, X } from "lucide-react";
import * as React from "react";

type MixPickerColorsRowProps = {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  disabled?: boolean;
  onChange(recipe: AppearanceRecipeV3): void;
};

function usesFullSpectrumRandomization(recipe: AppearanceRecipeV3): boolean {
  return (
    recipe.randomization === "full-spectrum-v1" ||
    recipe.randomization === "full-spectrum-v2"
  );
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
  const values = selectionValuesV3(recipe.material);
  const bringsOwn = values.filter(
    (material) => materialColorEffectV4(material) === "adds-own-colors",
  );
  const responds = values.filter(
    (material) => materialColorEffectV4(material) !== "adds-own-colors",
  );
  const ownNames = bringsOwn.map((material) =>
    materialName(catalog, material.family),
  );
  const respondNames = responds.map((material) =>
    materialName(catalog, material.family),
  );

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
    onChange(updated);
  };

  if (responds.length === 0) {
    return (
      <section aria-label="Colors">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Colors
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These materials bring their own colors.
        </p>
      </section>
    );
  }

  const caption =
    bringsOwn.length === 0
      ? null
      : `Applies to ${respondNames.join(" + ")} — ${ownNames.join(" + ")} ${
          ownNames.length === 1 ? "brings" : "bring"
        } its own`;

  const colors = recipe.colors;

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
            <label
              aria-label={`Palette color ${index + 1}`}
              className="block h-9 w-9 cursor-pointer overflow-hidden rounded-full border border-border"
              style={{ backgroundColor: color }}
            >
              <input
                type="color"
                value={color}
                disabled={disabled}
                onChange={(event) => {
                  const next = [...colors.colors];
                  next[index] = event.target.value.toLowerCase();
                  emit({ mode: "palette", colors: next });
                }}
                className="sr-only"
              />
            </label>
            {colors.colors.length > 2 && !disabled && (
              <button
                type="button"
                aria-label={`Remove palette color ${index + 1}`}
                onClick={() =>
                  emit({
                    mode: "palette",
                    colors: colors.colors.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
                className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border bg-background text-muted-foreground hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
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
    editor = (
      <div className="flex flex-wrap items-center gap-2">
        <label
          aria-label="Dice color"
          className="block h-9 w-9 cursor-pointer overflow-hidden rounded-full border border-border"
          style={{ backgroundColor: colors.primary }}
        >
          <input
            type="color"
            value={colors.primary}
            disabled={disabled}
            onChange={(event) =>
              emit({ ...colors, primary: event.target.value.toLowerCase() })
            }
            className="sr-only"
          />
        </label>
        <div role="group" aria-label="Color treatment" className="flex gap-1">
          {(["solid", "tonal"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={colors.mode === mode}
              disabled={disabled}
              onClick={() => emit({ mode, primary: colors.primary })}
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

  return (
    <section aria-label="Colors">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide">
          Colors
        </h3>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            emit(surpriseColors(curatedPalettePool(catalog), Math.random))
          }
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Dices className="h-3.5 w-3.5" aria-hidden="true" />
          Surprise me
        </button>
      </header>
      {caption !== null && (
        <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      )}
      <div className="mt-2">{editor}</div>
    </section>
  );
}
