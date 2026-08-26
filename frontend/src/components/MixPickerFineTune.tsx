import { MixBar } from "@/components/MixPickerMaterialsRow";
import { selectionValuesV3 } from "@/lib/appearance-editor-v3";
import {
  applyColorChance,
  colorChanceOf,
  type ColorChance,
} from "@/lib/mix-picker-state";
import { MATERIAL_WEIGHT_TOTAL_V3 } from "@/lib/material-weight-percentages";
import type {
  AppearanceCatalogV3,
  AppearanceRecipeV3,
} from "@/types/appearance";
import * as React from "react";

type MixPickerFineTuneProps = {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  open: boolean;
  disabled?: boolean;
  onClose(): void;
  onChange(recipe: AppearanceRecipeV3): void;
};

const GRADIENT_TRIGGER_CAPTION =
  "Gradient appears when Classic · Gradient is in your mix.";

function usesClassicGradient(recipe: AppearanceRecipeV3): boolean {
  return selectionValuesV3(recipe.material).some(
    (material) =>
      material.family === "classic" && material.treatment === "gradient",
  );
}

const COLOR_CHANCE_OPTIONS: readonly {
  chance: ColorChance;
  label: string;
  caption?: string;
}[] = [
  { chance: "mine", label: "My colors only" },
  {
    chance: "accent",
    label: "One random accent joins my colors",
    caption: "Needs a palette — switching converts your color.",
  },
  { chance: "bright", label: "Bright random pair" },
];

function equalShares(count: number): number[] {
  const base = Math.floor(MATERIAL_WEIGHT_TOTAL_V3 / count);
  const shares = Array.from({ length: count }, () => base);
  let remainder = MATERIAL_WEIGHT_TOTAL_V3 - base * count;
  for (let index = 0; remainder > 0; index++, remainder--) {
    shares[index % count] += 1;
  }
  return shares;
}

function upgradeToWeighted(
  selection: AppearanceRecipeV3["font"],
): AppearanceRecipeV3["font"] {
  if (selection.mode !== "allowlist" || selection.values.length < 2) {
    return selection;
  }
  const values = [...selection.values];
  const weights = equalShares(values.length);
  return {
    mode: "weighted",
    options: values.map((value, index) => ({
      value,
      weight: weights[index] as number,
    })),
  };
}

function downgradeToAllowlist(
  selection: AppearanceRecipeV3["font"],
): AppearanceRecipeV3["font"] {
  if (selection.mode !== "weighted") return selection;
  return { mode: "allowlist", values: selection.options.map(({ value }) => value) };
}

function ChipGroup<Value extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly { id: Value; name: string }[];
  selected: Value;
  onSelect(value: Value): void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map(({ id, name }) => (
        <button
          key={id}
          type="button"
          aria-pressed={selected === id}
          onClick={() => onSelect(id)}
          className={`min-h-9 rounded-md border px-2 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            selected === id
              ? "border-brand bg-brand/10 text-brand"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

export function MixPickerFineTune({
  recipe,
  catalog,
  open,
  disabled = false,
  onClose,
  onChange,
}: MixPickerFineTuneProps) {
  if (!open) return null;
  const gradientActive =
    recipe.colors.mode !== "solid" && usesClassicGradient(recipe);
  const fontWeighted = recipe.font.mode === "weighted";
  const inkWeighted = recipe.engraving.mode === "weighted";
  const weighAnyRow = fontWeighted || inkWeighted;
  const chance = colorChanceOf(recipe);

  return (
    <div
      role="dialog"
      aria-label="Fine-tune"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="max-h-[85vh] w-full max-w-xl space-y-6 overflow-y-auto rounded-xl border bg-card p-4 shadow-lg sm:p-6">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Fine-tune</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" className="sm:hidden">Done</span>
            <span className="sr-only sm:hidden">Close fine-tune</span>
            <span className="hidden sm:inline">Close ✕</span>
          </button>
        </header>

        <section aria-label="Mix details" className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Mix details
          </h3>
          <ChipGroup
            label="Vary per"
            options={catalog.variationScopes}
            selected={recipe.varyBy}
            onSelect={(varyBy) => onChange({ ...recipe, varyBy })}
          />
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium">Color chance</legend>
            {COLOR_CHANCE_OPTIONS.map(({ chance: option, label, caption }) => {
              const active = chance === option && !disabled;
              return (
                <label key={option} className="flex items-start gap-2 py-0.5">
                  <input
                    type="radio"
                    name="color-chance"
                    checked={active}
                    disabled={disabled}
                    onChange={() =>
                      onChange(applyColorChance(recipe, option, catalog))
                    }
                  />
                  <span>
                    <span className="block text-sm">{label}</span>
                    {(option === "accent" || active) && (
                      <span className="block text-xs text-muted-foreground">
                        {caption ??
                          (option === "bright"
                            ? "Every die draws its own bright pair."
                            : "Your palette is used as-is.")}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </section>

        <section aria-label="Gradient" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Gradient
          </h3>
          {!gradientActive ? (
            <p className="text-xs text-muted-foreground">
              {GRADIENT_TRIGGER_CAPTION}
            </p>
          ) : (
            <>
              <ChipGroup
                label="Spread"
                options={catalog.gradient.scopes}
                selected={
                  selectionValuesV3(recipe.gradient.scope)[0] ?? "whole-die"
                }
                onSelect={(scope) =>
                  onChange({
                    ...recipe,
                    gradient: {
                      ...recipe.gradient,
                      scope: { mode: "fixed", value: scope },
                    },
                  })
                }
              />
              <ChipGroup
                label="Direction"
                options={catalog.gradient.directions}
                selected={
                  selectionValuesV3(recipe.gradient.direction)[0] ??
                  "top-to-bottom"
                }
                onSelect={(direction) =>
                  onChange({
                    ...recipe,
                    gradient: {
                      ...recipe.gradient,
                      direction: { mode: "fixed", value: direction },
                    },
                  })
                }
              />
            </>
          )}
        </section>

        <section aria-label="Shape and light" className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Shape &amp; light
          </h3>
          <ChipGroup
            label="Form"
            options={catalog.forms}
            selected={
              selectionValuesV3(recipe.form.polyhedral)[0] ?? "standard"
            }
            onSelect={(form) =>
              onChange({
                ...recipe,
                form: {
                  ...recipe.form,
                  polyhedral: { mode: "fixed", value: form },
                },
              })
            }
          />
          <ChipGroup
            label="Lighting"
            options={catalog.lighting.modes}
            selected={selectionValuesV3(recipe.lighting.mode)[0] ?? "facet"}
            onSelect={(mode) =>
              onChange({
                ...recipe,
                lighting: {
                  ...recipe.lighting,
                  mode: { mode: "fixed", value: mode },
                },
              })
            }
          />
          {(selectionValuesV3(recipe.lighting.mode)[0] ?? "facet") !==
            "none" && (
            <ChipGroup
              label="Strength"
              options={catalog.lighting.strengths}
              selected={
                selectionValuesV3(recipe.lighting.strength)[0] ?? "subtle"
              }
              onSelect={(strength) =>
                onChange({
                  ...recipe,
                  lighting: {
                    ...recipe.lighting,
                    strength: { mode: "fixed", value: strength },
                  },
                })
              }
            />
          )}
        </section>

<section aria-label="Weigh any row" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Weigh any row
          </h3>
          <p className="text-xs text-muted-foreground">
            Multi-selected rows get a share bar, like materials.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={weighAnyRow}
              disabled={disabled}
              onChange={(event) => {
                const convert = event.target.checked
                  ? upgradeToWeighted
                  : downgradeToAllowlist;
                onChange({
                  ...recipe,
                  font: convert(recipe.font),
                  engraving: convert(recipe.engraving),
                });
              }}
            />
            Share bars on font and ink rows
          </label>
          {fontWeighted && recipe.font.mode === "weighted" && (
            <MixBar
              names={recipe.font.options.map(({ value }) =>
                catalog.fonts.find(({ id }) => id === value)?.name ?? value,
              )}
              weights={recipe.font.options.map(({ weight }) => weight)}
              disabled={disabled}
              onCommit={(weights) =>
                onChange({
                  ...recipe,
                  font: {
                    mode: "weighted",
                    options: recipe.font.options.map((option, index) => ({
                      ...option,
                      weight: weights[index] as number,
                    })),
                  },
                })
              }
            />
          )}
          {inkWeighted && recipe.engraving.mode === "weighted" && (
            <MixBar
              names={recipe.engraving.options.map(({ value }) =>
                catalog.engravingFinishes.find(({ id }) => id === value)?.name ??
                  value,
              )}
              weights={recipe.engraving.options.map(({ weight }) => weight)}
              disabled={disabled}
              onCommit={(weights) =>
                onChange({
                  ...recipe,
                  engraving: {
                    mode: "weighted",
                    options: recipe.engraving.options.map((option, index) => ({
                      ...option,
                      weight: weights[index] as number,
                    })),
                  },
                })
              }
            />
          )}
        </section>      </div>
    </div>
  );
}
