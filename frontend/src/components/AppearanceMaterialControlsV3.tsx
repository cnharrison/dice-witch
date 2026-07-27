import { AppearanceMaterialOptionV3 } from "@/components/AppearanceMaterialOptionV3";
import { AppearanceSelectV3 } from "@/components/AppearanceSelectV3";
import { Button } from "@/components/ui/button";
import { createDefaultAppearanceMaterialV3 } from "@/lib/appearance-editor-v3";
import {
  MATERIAL_WEIGHT_TOTAL_V3,
  addMaterialWeightV3,
  formatMaterialWeightPercentV3,
  normalizeMaterialWeightsV3,
  removeMaterialWeightV3,
  updateMaterialWeightV3,
} from "@/lib/material-weight-percentages";
import type { AppearanceCatalogV3 } from "@/types/appearance";
import {
  parseAppearanceRecipeV3,
  type AppearanceMaterialV4,
  type AppearanceRecipeV3,
  type MaterialFamilyV4,
} from "@dice-witch/dice-v4-model";
import { Plus, Trash2 } from "lucide-react";
import * as React from "react";

type MaterialSelection = AppearanceRecipeV3["material"];

type MaterialEntry = Readonly<{
  material: AppearanceMaterialV4;
  weight: number;
}>;

function materialEntries(selection: MaterialSelection): readonly MaterialEntry[] {
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

function withMaterialEntries(
  mode: MaterialSelection["mode"],
  entries: readonly MaterialEntry[],
): MaterialSelection {
  const first = entries[0];
  if (first === undefined) {
    throw new Error("Appearance material selection cannot be empty");
  }
  if (mode === "fixed") return { mode, value: first.material };
  if (mode === "allowlist") {
    return { mode, values: entries.map(({ material }) => material) };
  }
  return {
    mode,
    options: entries.map(({ material: value, weight }) => ({ value, weight })),
  };
}

function plainOptionName(value: string): string {
  const words = value.replaceAll("-", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function materialVariant(material: AppearanceMaterialV4): string {
  switch (material.family) {
    case "classic":
      return material.treatment === "pattern"
        ? plainOptionName(material.patternId)
        : plainOptionName(material.treatment);
    case "sharp-resin":
    case "glass":
      return plainOptionName(material.style);
    case "liquid-core":
      return plainOptionName(material.core);
    case "gemstone":
    case "stone":
      return plainOptionName(material.stone);
    case "metal":
    case "hollow-metal":
      return plainOptionName(material.metal);
    case "wood":
      return plainOptionName(material.wood);
    case "fantasy":
      return plainOptionName(material.essence);
  }
}

function repeatedGradient(recipe: AppearanceRecipeV3): boolean {
  const scope = recipe.gradient.scope;
  if (scope.mode === "fixed") return scope.value === "repeated";
  if (scope.mode === "allowlist") return scope.values.includes("repeated");
  return scope.options.some(({ value }) => value === "repeated");
}

export function AppearanceMaterialControlsV3({
  recipe,
  catalog,
  onChange,
}: {
  recipe: AppearanceRecipeV3;
  catalog: AppearanceCatalogV3;
  onChange(recipe: AppearanceRecipeV3): void;
}) {
  const entries = materialEntries(recipe.material);
  const weighted = recipe.material.mode === "weighted";
  const multiple = recipe.material.mode !== "fixed";
  const materialWeights = weighted
    ? normalizeMaterialWeightsV3(entries.map(({ weight }) => weight))
    : [];
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [addFamily, setAddFamily] = React.useState<MaterialFamilyV4>("classic");
  const [error, setError] = React.useState<string | null>(null);
  const activeIndex = Math.min(selectedIndex, entries.length - 1);
  const activeEntry = entries[activeIndex];
  if (activeEntry === undefined) {
    throw new Error("Appearance material selection cannot be empty");
  }

  React.useEffect(() => {
    if (selectedIndex !== activeIndex) setSelectedIndex(activeIndex);
  }, [activeIndex, selectedIndex]);

  const materialNames = new Map(
    catalog.materials.map(({ family, name }) => [family, name]),
  );
  const defaultMaterials = new Map(
    catalog.materials.map(({ family, defaultValue }) => [
      family,
      JSON.stringify(defaultValue),
    ]),
  );
  const selectedMaterials = new Set(
    entries.map(({ material }) => JSON.stringify(material)),
  );
  const availableFamilies = catalog.materials.filter(
    ({ family }) => !selectedMaterials.has(defaultMaterials.get(family) ?? ""),
  );
  const selectedAddFamily = availableFamilies.some(
    ({ family }) => family === addFamily,
  )
    ? addFamily
    : availableFamilies[0]?.family;

  const emit = (next: AppearanceRecipeV3) => {
    try {
      const parsed = parseAppearanceRecipeV3({
        ...next,
        form: { ...next.form, policy: "material-default-v1" },
      });
      setError(null);
      onChange(parsed);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Appearance material selection is invalid",
      );
    }
  };

  const setEntries = (
    nextEntries: readonly MaterialEntry[],
    mode = recipe.material.mode,
  ) => {
    emit({ ...recipe, material: withMaterialEntries(mode, nextEntries) });
  };

  const changeMode = (mode: MaterialSelection["mode"]) => {
    let nextEntries = mode === "fixed" ? entries.slice(0, 1) : entries;
    if (mode === "weighted") {
      const weights = normalizeMaterialWeightsV3(
        nextEntries.map(({ weight }) => weight),
      );
      nextEntries = nextEntries.map((entry, index) => ({
        ...entry,
        weight: weights[index] as number,
      }));
    }
    setSelectedIndex(0);
    setEntries(nextEntries, mode);
  };

  const updateEntry = (index: number, material: AppearanceMaterialV4) => {
    setEntries(
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, material } : entry,
      ),
    );
  };

  const updateWeight = (index: number, weight: number) => {
    try {
      const nextWeights = updateMaterialWeightV3(
        materialWeights,
        index,
        weight,
      );
      setEntries(
        entries.map((entry, entryIndex) => ({
          ...entry,
          weight: nextWeights[entryIndex] as number,
        })),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Material weight is invalid",
      );
    }
  };

  const removeEntry = (index: number) => {
    if (entries.length === 1) return;
    let nextEntries = entries.filter((_, entryIndex) => entryIndex !== index);
    if (weighted) {
      const nextWeights = removeMaterialWeightV3(materialWeights, index);
      nextEntries = nextEntries.map((entry, entryIndex) => ({
        ...entry,
        weight: nextWeights[entryIndex] as number,
      }));
    }
    setSelectedIndex(Math.max(0, Math.min(index, nextEntries.length - 1)));
    setEntries(nextEntries);
  };

  const addEntry = () => {
    if (selectedAddFamily === undefined) return;
    const material = createDefaultAppearanceMaterialV3(
      selectedAddFamily,
      catalog,
    );
    let nextEntries = [
      ...entries,
      { material, weight: catalog.bounds.selectionWeight.minimum },
    ];
    if (weighted) {
      const nextWeights = addMaterialWeightV3(materialWeights);
      nextEntries = nextEntries.map((entry, index) => ({
        ...entry,
        weight: nextWeights[index] as number,
      }));
    }
    setSelectedIndex(nextEntries.length - 1);
    setEntries(nextEntries);
  };

  const atMaterialLimit =
    multiple && entries.length >= catalog.bounds.maximumMaterialOptions;
  const activeFamilyName = materialNames.get(activeEntry.material.family) ??
    activeEntry.material.family;
  const activeName = `${activeFamilyName} · ${materialVariant(activeEntry.material)}`;

  return (
    <section className="space-y-4" aria-labelledby="material-controls-heading">
      <h2 id="material-controls-heading" className="text-sm font-semibold">
        Materials
      </h2>

      <label className="block space-y-1.5 text-xs font-medium">
        <span className="block">Use</span>
        <AppearanceSelectV3
          aria-label="Material selection mode"
          value={recipe.material.mode}
          onChange={(event) =>
            changeMode(event.target.value as MaterialSelection["mode"])
          }
          containerClassName="sm:max-w-xs"
        >
          <option value="fixed">One material</option>
          <option value="allowlist">Several materials equally</option>
          <option value="weighted">Custom mix</option>
        </AppearanceSelectV3>
      </label>

      <div className="grid items-start gap-4">
        {multiple && (
          <fieldset className="min-w-0 space-y-4 rounded-lg border bg-muted/20 p-4">
            <legend className="px-1 text-sm font-semibold">Material mix</legend>
            <label className="block max-w-xl space-y-1.5 text-xs font-medium">
              <span className="block">Material to edit</span>
              <AppearanceSelectV3
                aria-label="Material in mix"
                value={String(activeIndex)}
                onChange={(event) =>
                  setSelectedIndex(Number(event.target.value))
                }
              >
                {entries.map((entry, index) => {
                  const familyName =
                    materialNames.get(entry.material.family) ??
                    entry.material.family;
                  const name = `${familyName} · ${materialVariant(entry.material)}`;
                  const percentage = weighted
                    ? ` — ${formatMaterialWeightPercentV3(
                        materialWeights[index] as number,
                      )}`
                    : "";
                  return (
                    <option
                      key={`${String(index)}-${entry.material.family}`}
                      value={index}
                    >
                      {name}
                      {percentage}
                    </option>
                  );
                })}
              </AppearanceSelectV3>
            </label>
            {weighted && (
              <label className="block max-w-xl space-y-1.5 text-xs font-medium">
                <span className="flex items-center justify-between gap-3">
                  <span>Share of rolls</span>
                  <output className="font-mono tabular-nums text-muted-foreground">
                    {formatMaterialWeightPercentV3(
                      materialWeights[activeIndex] as number,
                    )}
                  </output>
                </span>
                <input
                  aria-label={`${activeName} share`}
                  aria-valuetext={formatMaterialWeightPercentV3(
                    materialWeights[activeIndex] as number,
                  )}
                  type="range"
                  min={catalog.bounds.selectionWeight.minimum}
                  max={
                    MATERIAL_WEIGHT_TOTAL_V3 -
                    (entries.length - 1) *
                      catalog.bounds.selectionWeight.minimum
                  }
                  step={catalog.bounds.selectionWeight.step}
                  value={materialWeights[activeIndex] as number}
                  disabled={entries.length === 1}
                  onChange={(event) =>
                    updateWeight(activeIndex, event.currentTarget.valueAsNumber)
                  }
                  className="h-11 w-full cursor-pointer accent-brand disabled:cursor-default sm:h-9"
                />
                <span className="block font-normal text-muted-foreground">
                  Other shares rebalance automatically to keep the mix at 100%.
                </span>
              </label>
            )}
          </fieldset>
        )}

        <section
          className="rounded-lg border bg-background p-4"
          aria-labelledby="material-editor-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="material-editor-heading" className="text-sm font-semibold">
              Edit {activeName}
            </h3>
            {multiple && entries.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeEntry(activeIndex)}
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            <label className="block max-w-sm space-y-1.5 text-xs font-medium">
              <span className="block">Material</span>
              <AppearanceSelectV3
                aria-label="Material"
                value={activeEntry.material.family}
                onChange={(event) =>
                  updateEntry(
                    activeIndex,
                    createDefaultAppearanceMaterialV3(
                      event.target.value as MaterialFamilyV4,
                      catalog,
                    ),
                  )
                }
              >
                {catalog.materials.map(({ family, name }) => (
                  <option key={family} value={family}>
                    {name}
                  </option>
                ))}
              </AppearanceSelectV3>
            </label>
            <AppearanceMaterialOptionV3
              material={activeEntry.material}
              catalog={catalog}
              repeatedGradient={repeatedGradient(recipe)}
              onChange={(material) => updateEntry(activeIndex, material)}
            />
          </div>
        </section>
      </div>

      {multiple && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block space-y-1.5 text-xs font-medium">
            <span className="block">New material</span>
            <AppearanceSelectV3
              aria-label="Material to add"
              value={selectedAddFamily ?? ""}
              disabled={atMaterialLimit || selectedAddFamily === undefined}
              onChange={(event) =>
                setAddFamily(event.target.value as MaterialFamilyV4)
              }
              className="sm:h-10"
            >
              {availableFamilies.map(({ family, name }) => (
                <option key={family} value={family}>
                  {name}
                </option>
              ))}
            </AppearanceSelectV3>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={atMaterialLimit || selectedAddFamily === undefined}
            onClick={addEntry}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add material
          </Button>
        </div>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
