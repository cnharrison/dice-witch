import { AppearanceMaterialOptionV3 } from "@/components/AppearanceMaterialOptionV3";
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
  AppearanceMaterialV4,
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

type MaterialEntry = Readonly<{
  material: AppearanceMaterialV4;
  weight: number;
}>;

function materialEntries(
  selection: AppearanceRecipeV3["material"],
): readonly MaterialEntry[] {
  switch (selection.mode) {
    case "fixed":
      return [{ material: selection.value, weight: 1 }];
    case "allowlist":
      return selection.values.map((material) => ({ material, weight: 1 }));
    case "weighted":
      return selection.options.map(({ value: material, weight }) => ({
        material,
        weight,
      }));
  }
}

// Parameter edits swap one family's value in place; siblings and weights
// stay untouched so tuned parameters survive.
function withReplacedMaterial(
  selection: AppearanceRecipeV3["material"],
  family: string,
  next: AppearanceMaterialV4,
): AppearanceRecipeV3["material"] {
  switch (selection.mode) {
    case "fixed":
      return { mode: "fixed", value: next };
    case "allowlist":
      return {
        mode: "allowlist",
        values: selection.values.map((value) =>
          value.family === family ? next : value,
        ),
      };
    case "weighted":
      return {
        mode: "weighted",
        options: selection.options.map(({ value, weight }) => ({
          value: value.family === family ? next : value,
          weight,
        })),
      };
  }
}

// Repeated gradient spreads only when every die is a standard-cut classic
// gradient; otherwise per-side/whole-die carry the look alone.
function supportsRepeatedGradient(recipe: AppearanceRecipeV3): boolean {
  return (
    selectionValuesV3(recipe.material).every(
      (material) =>
        material.family === "classic" && material.treatment === "gradient",
    ) &&
    selectionValuesV3(recipe.form.polyhedral).every(
      (form) => form === "standard",
    )
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
  const [openMaterialFamily, setOpenMaterialFamily] =
    React.useState<string | null>(null);
  if (!open) return null;
  const gradientActive =
    recipe.colors.mode !== "solid" && usesClassicGradient(recipe);
  const fontWeighted = recipe.font.mode === "weighted";
  const inkWeighted = recipe.engraving.mode === "weighted";
  const weighAnyRow = fontWeighted || inkWeighted;
  const chance = colorChanceOf(recipe);
  const materialRows = materialEntries(recipe.material);
  // Recipe weights are ratios, not shares of a fixed total, so shares
  // derive from the actual sum.
  const materialWeightTotal = materialRows.reduce(
    (sum, { weight }) => sum + weight,
    0,
  );
  const repeatedGradient = supportsRepeatedGradient(recipe);
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

        <section aria-label="Material parameters" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide">
            Material parameters
          </h3>
          <p className="text-xs text-muted-foreground">
            One accordion per material in your bar.
          </p>
          {materialRows.map(({ material, weight }) => {
            const name =
              catalog.materials.find(
                ({ family }) => family === material.family,
              )?.name ?? material.family;
            const expanded = openMaterialFamily === material.family;
            return (
              <div
                key={material.family}
                className="rounded-lg border"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  disabled={disabled}
                  onClick={() =>
                    setOpenMaterialFamily(expanded ? null : material.family)
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <span>
                    <span aria-hidden="true" className="mr-1">
                      {expanded ? "▾" : "▸"}
                    </span>
                    {name}
                  </span>
                  {recipe.material.mode === "weighted" && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round((weight / materialWeightTotal) * 100)}%
                    </span>
                  )}
                </button>
                {expanded && (
                  <div className="border-t p-3">
                    <AppearanceMaterialOptionV3
                      material={material}
                      catalog={catalog}
                      repeatedGradient={repeatedGradient}
                      onChange={(nextMaterial) =>
                        onChange({
                          ...recipe,
                          material: withReplacedMaterial(
                            recipe.material,
                            material.family,
                            nextMaterial,
                          ),
                        })
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
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
